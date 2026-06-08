/**
 * 插件层 —— rsbuild 风格的装配 + opencode 风格的统一 hook 切口。
 *
 * 一个 {@link Plugin} = `{ name, pre?, post?, setup(api) }`。**没有静态贡献字段**，一切
 * 通过 `setup(api)` 命令式声明：
 *  - **贡献**：`addTool` / `addModel` / `addMcp` / `setSearch` / `setSandbox`（进进程级注册表）；
 *  - **装配期修改**：`modifySpec`（链式改 {@link AgentSpec}）；
 *  - **运行时 hook**：`hook(name, (input, output) => …)` —— opencode 风格的点分命名 + `(input, output)`
 *    **原地 mutate**。除 `"event"` 外都被**编译成一个 LangChain `createMiddleware`**（贴合 DeepAgent 底座，
 *    不自造 hook 总线），经 {@link build} 自动挂到 agent 上；`"event"` 订阅 {@link bus} 事件总线。
 *
 * 顺序：插件间用 `pre`/`post` 声明依赖（装配前拓扑排序）；同一 hook 多个 handler 用 `order`
 *（`pre`/`default`/`post`）排序。插件间可用 `expose`/`useExposed` 共享值。
 *
 * 生效：`await use([...])` 跑插件 setup → 收集贡献与 hooks 进全局 {@link manager}；其后
 * `Agent.create(...)` 装配时自动应用（`manager.applySpec` + `manager.middleware()`）。
 */
import { SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredTool } from "@langchain/core/tools";
import type { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { Signal } from "@openconsole/signal";
import type { AnyBackendProtocol } from "deepagents";
import { createMiddleware, type AgentMiddleware } from "langchain";

import { bus as defaultBus, type BusEvents } from "./bus";
import type { Event } from "./event";
import { models as defaultModels, ModelRegistry, type ModelRef } from "./model";
import { registry as defaultRegistry, ToolRegistry } from "./registry";
import type { McpServers } from "../capabilities/mcp";
import type { SearchProvider } from "../capabilities/tools/search";
import type { AgentSpec } from "../types";

/** 钩子在所属 hook 内的执行序：`pre` 最先、`post` 最后、`default` 居中。 */
export type Order = "pre" | "default" | "post";

/** 插件卸载函数：移除本批 hooks/modifiers/exposed、解绑 bus 订阅并关闭其 MCP 连接。 */
export type Teardown = () => Promise<void>;

/** hook handler 的返回（同步或异步的 void）。 */
type HookReturn = void | Promise<void>;
type Args = Record<string, unknown>;

/** `chat.params` 可调的采样参数（落到 LangChain `ModelRequest.modelSettings`，每轮 re-bind）。 */
export interface ChatParams {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  /** 其余 provider 特定项，原样并入 modelSettings。 */
  options?: Record<string, unknown>;
}

/**
 * 运行时 hook 映射（opencode 风格：点分命名 + `(input, output)` 原地 mutate）。
 *
 * 除 `"event"`（订阅 {@link bus} 观测）外，其余在编译出的 "plugins" 中间件里被调用：
 *  - `system.transform` / `chat.params` / `tool.definition` → `wrapModelCall`；
 *  - `permission.ask` / `tool.execute.after` → `wrapToolCall`；
 *  - `agent.start` / `agent.end` → `beforeAgent` / `afterAgent`。
 */
export interface HookMap {
  /** 改/替换发给模型的系统提示；`output.system` 初始为当前系统消息文本（改它即替换）。 */
  "system.transform": (
    input: { messages: BaseMessage[]; runtime: unknown },
    output: { system: string },
  ) => HookReturn;
  /** 改本轮采样参数（合并进 modelSettings）。 */
  "chat.params": (
    input: { messages: BaseMessage[]; runtime: unknown },
    output: ChatParams,
  ) => HookReturn;
  /** 改某工具发给模型的定义；`output.description` 初始为工具现值（`parameters` 为 best-effort）。 */
  "tool.definition": (
    input: { name: string; runtime: unknown },
    output: { description: string; parameters?: unknown },
  ) => HookReturn;
  /** 工具调用前的权限决策：mutate `output.status`（`deny` 短路）/ `output.args`（改参）。 */
  "permission.ask": (
    input: { tool: string; args: Args; toolCallId: string; runtime: unknown },
    output: { status: "allow" | "deny" | "ask"; reason?: string; args?: Args },
  ) => HookReturn;
  /** 工具调用后：替换 `output.result`。 */
  "tool.execute.after": (
    input: { tool: string; args: Args; toolCallId: string; runtime: unknown },
    output: { result: ToolMessage },
  ) => HookReturn;
  /** agent 开始时触发一次（观测/副作用，无 output）。 */
  "agent.start": (input: {
    messages: BaseMessage[];
    runtime: unknown;
  }) => HookReturn;
  /** agent 结束时触发一次（观测/副作用，无 output）。 */
  "agent.end": (input: {
    messages: BaseMessage[];
    runtime: unknown;
  }) => HookReturn;
  /** 订阅事件总线 {@link bus}：观测工具/运行时事件（无 output）。 */
  event: (input: { event: Event }) => HookReturn;
}

/** 全部 hook 名。 */
export type HookName = keyof HookMap;

type SpecModifier = (spec: AgentSpec) => AgentSpec | void;

/** 桶内统一存储用的弱类型 hook（入口 {@link PluginApi.hook} 按名保证强类型，调用处再还原）。 */
type StoredHook = (input: unknown, output: unknown) => HookReturn;

/** 注册项：带 `order` 与来源 `plugin`，便于排序与卸载。 */
interface Entry<T> {
  fn: T;
  order: Order;
  plugin: string;
}

/** `use()` 一批注册的记账（供 teardown 精确移除）。 */
interface Added {
  spec: Entry<SpecModifier>[];
  hooks: Array<[HookName, Entry<StoredHook>]>;
  busUnsubs: Array<() => void>;
  exposedKeys: string[];
}

/**
 * `setup(api)` 拿到的把手。rsbuild 式：贡献用 `addXxx`，装配期修改用 `modifySpec`，
 * 运行时介入用统一的 `hook(name, handler)`，插件间通信用 `expose/useExposed`。
 */
export interface PluginApi {
  /** 当前插件名。 */
  readonly name: string;
  /** 只读运行上下文。 */
  readonly context: { cwd: string };

  // —— 贡献（命令式）——
  /** 注册一个工具（按名进 registry，`.agent` 可按名引用）。 */
  addTool(tool: StructuredTool): void;
  /** 注册一个模型别名。 */
  addModel(alias: string, model: ModelRef): void;
  /** 连接一组 MCP server 并把工具注册进 registry；teardown 时自动关闭。 */
  addMcp(servers: McpServers): Promise<void>;
  /** 替换网页搜索后端（Tavily / SearxNG…）。 */
  setSearch(provider: SearchProvider): Promise<void>;
  /** 替换文件系统/沙箱 backend（backend 实为 per-agent，此处仅告警引导）。 */
  setSandbox(backend: AnyBackendProtocol): void;

  // —— 装配期 modify（链式）——
  /** 装配前链式修改 {@link AgentSpec}（model/tools/prompt）。 */
  modifySpec(fn: SpecModifier, opts?: { order?: Order }): void;

  // —— 运行时 hook（具名方法 / 命名空间，opencode 风格切口）——
  // 全部 `(input, output)` 原地 mutate（`start`/`end`/`event` 仅 `input`，纯观测）；
  // 同切口多 handler 用 `opts.order` 排序。内部仍归一到 {@link HookMap} 的点分名。
  /** 改「发给模型的请求」：system（系统提示）/ params（采样参数）/ tool（工具定义）。 */
  readonly transform: {
    /** 改/替换系统提示（`output.system` 初始为当前系统消息文本）。 */
    system(handler: HookMap["system.transform"], opts?: { order?: Order }): void;
    /** 改本轮采样参数（合并进 modelSettings）。 */
    params(handler: HookMap["chat.params"], opts?: { order?: Order }): void;
    /** 改某工具发给模型的定义（description / parameters）。 */
    tool(handler: HookMap["tool.definition"], opts?: { order?: Order }): void;
  };
  /** 工具调用前的权限决策：mutate `output.status`（`deny` 短路）/ `output.args`（改参）。 */
  permission(handler: HookMap["permission.ask"], opts?: { order?: Order }): void;
  /** 工具调用后：替换 `output.result`。 */
  result(handler: HookMap["tool.execute.after"], opts?: { order?: Order }): void;
  /** agent 开始时触发一次（观测）。 */
  start(handler: HookMap["agent.start"], opts?: { order?: Order }): void;
  /** agent 结束时触发一次（观测）。 */
  end(handler: HookMap["agent.end"], opts?: { order?: Order }): void;
  /** 订阅事件总线 {@link bus}：观测工具/运行时事件。 */
  event(handler: HookMap["event"]): void;

  // —— 插件间通信 ——
  /** 暴露一个值供其它插件 {@link PluginApi.useExposed}（靠 pre/post 保证时序）。 */
  expose<T>(id: string, value: T): void;
  /** 取另一插件暴露的值。 */
  useExposed<T>(id: string): T | undefined;
}

/** 插件定义（rsbuild 式）。 */
export interface Plugin {
  /** 插件名：日志、{@link PluginRegistry} 去重键、pre/post 引用键。 */
  name: string;
  /** 这些插件须在本插件**之前** setup。 */
  pre?: string[];
  /** 这些插件须在本插件**之后** setup。 */
  post?: string[];
  /** 初始化：在此通过 `api` 声明贡献与 hooks。可异步（连 MCP、动态 import）。 */
  setup: (api: PluginApi) => void | Promise<void>;
}

function warn(plugin: string, message: string): void {
  console.warn(`[@openconsole/agent] plugin "${plugin}": ${message}`);
}

const RANK: Record<Order, number> = { pre: 0, default: 1, post: 2 };

/** 按 `order`（pre→default→post）稳定排序：同 order 内保持注册顺序。 */
function byOrder<T>(entries: Entry<T>[]): Entry<T>[] {
  return entries
    .map((e, i) => [e, i] as const)
    .sort((a, b) => RANK[a[0].order] - RANK[b[0].order] || a[1] - b[1])
    .map(([e]) => e);
}

/** 按 `pre`/`post` 依赖对插件做拓扑排序（DFS + 环检测）。未知名字忽略。 */
function topoSort(plugins: Plugin[]): Plugin[] {
  const byName = new Map(plugins.map((p) => [p.name, p]));
  // deps: name -> 必须先于它装配的插件名集合
  const deps = new Map<string, Set<string>>();
  for (const p of plugins) deps.set(p.name, new Set());
  for (const p of plugins) {
    for (const pre of p.pre ?? []) {
      if (byName.has(pre)) deps.get(p.name)?.add(pre); // pre 先于 p
    }
    for (const post of p.post ?? []) {
      if (byName.has(post)) deps.get(post)?.add(p.name); // p 先于 post
    }
  }
  const out: Plugin[] = [];
  const done = new Set<string>();
  const path = new Set<string>();
  const visit = (name: string): void => {
    if (done.has(name)) return;
    if (path.has(name)) {
      warn(name, "pre/post cycle detected — order may be unstable");
      return;
    }
    path.add(name);
    for (const dep of deps.get(name) ?? []) visit(dep);
    path.delete(name);
    done.add(name);
    const p = byName.get(name);
    if (p) out.push(p);
  };
  for (const p of plugins) visit(p.name);
  return out;
}

/** 取消息文本（防御非字符串 content）。 */
function textOfMessage(
  msg: { text?: unknown; content?: unknown } | undefined,
): string {
  if (!msg) return "";
  if (typeof msg.text === "string") return msg.text;
  if (typeof msg.content === "string") return msg.content;
  return "";
}

/** {@link ChatParams} → LangChain modelSettings（丢弃 undefined；按通用约定映射键名）。 */
function toModelSettings(p: ChatParams): Record<string, unknown> {
  const s: Record<string, unknown> = {};
  if (p.temperature !== undefined) s["temperature"] = p.temperature;
  if (p.topP !== undefined) s["top_p"] = p.topP;
  if (p.topK !== undefined) s["top_k"] = p.topK;
  if (p.maxOutputTokens !== undefined) s["max_tokens"] = p.maxOutputTokens;
  if (p.options) Object.assign(s, p.options);
  return s;
}

/** 从工具结果 ToolMessage 取 ok/content/artifact（与 observe 中间件同构）。 */
function readToolMessage(result: ToolMessage): {
  ok: boolean;
  content: string;
  data?: Record<string, unknown>;
} {
  const content =
    typeof result.text === "string"
      ? result.text
      : typeof result.content === "string"
        ? result.content
        : "";
  const artifact = (result as { artifact?: unknown }).artifact;
  const data =
    artifact && typeof artifact === "object"
      ? (artifact as Record<string, unknown>)
      : undefined;
  return {
    ok: result.status !== "error",
    content,
    ...(data !== undefined ? { data } : {}),
  };
}

/**
 * 插件管理器：跑 setup、收集贡献与 hooks、把 hooks 编译成中间件、装配期改 spec、向事件总线发布。
 * 进程级单例为 {@link manager}；可 `new` 出独立实例（含独立 bus）用于隔离装配 / 测试。
 */
export class PluginManager {
  private readonly specMods: Entry<SpecModifier>[] = [];
  private readonly hooks = new Map<HookName, Entry<StoredHook>[]>();
  private readonly exposed = new Map<string, unknown>();

  constructor(
    private readonly tools: ToolRegistry = defaultRegistry,
    private readonly models: ModelRegistry = defaultModels,
    private readonly bus: Signal<BusEvents> = defaultBus,
  ) {}

  /** 装配一组插件：拓扑排序 → 依序 setup → 收集贡献/hooks。返回 {@link Teardown}。 */
  async use(list: Plugin[]): Promise<Teardown> {
    const ordered = topoSort(list);
    const clients: MultiServerMCPClient[] = [];
    const added: Added = {
      spec: [],
      hooks: [],
      busUnsubs: [],
      exposedKeys: [],
    };

    for (const plugin of ordered) {
      plugins.register(plugin);
      await plugin.setup(this.makeApi(plugin, added, clients));
    }

    return async () => {
      const drop = <T>(arr: Entry<T>[], e: Entry<T>) => {
        const i = arr.indexOf(e);
        if (i >= 0) arr.splice(i, 1);
      };
      for (const e of added.spec) drop(this.specMods, e);
      for (const [name, e] of added.hooks) {
        const bucket = this.hooks.get(name);
        if (bucket) drop(bucket, e);
      }
      for (const off of added.busUnsubs) off();
      for (const k of added.exposedKeys) this.exposed.delete(k);
      for (const c of clients) await c.close();
    };
  }

  /** 装配期：按 order 链式应用所有 `modifySpec`，返回最终 spec。 */
  applySpec(spec: AgentSpec): AgentSpec {
    let out = spec;
    for (const e of byOrder(this.specMods)) {
      const next = e.fn(out);
      if (next) out = next;
    }
    return out;
  }

  /** 把当前所有运行时 hooks 编译成一个中间件；无 hook 且无 bus 订阅时返回 undefined。 */
  middleware(): AgentMiddleware | undefined {
    const sorted = (n: HookName) => byOrder(this.hooks.get(n) ?? []);
    const sysHooks = sorted("system.transform");
    const paramHooks = sorted("chat.params");
    const defHooks = sorted("tool.definition");
    const permHooks = sorted("permission.ask");
    const afterHooks = sorted("tool.execute.after");
    const startHooks = sorted("agent.start");
    const endHooks = sorted("agent.end");

    const needModel =
      sysHooks.length > 0 || paramHooks.length > 0 || defHooks.length > 0;
    const needTool = permHooks.length > 0 || afterHooks.length > 0;
    // 有订阅者才发布事件（signal.emit 无监听开销极小，但据此决定是否挂 wrapToolCall）
    const needEmit = this.bus.has();
    const needStart = startHooks.length > 0;
    const needEnd = endHooks.length > 0;
    if (!needModel && !needTool && !needEmit && !needStart && !needEnd) {
      return undefined;
    }

    const emitBus = this.bus;
    return createMiddleware({
      name: "plugins",
      ...(needModel
        ? {
            wrapModelCall: async (request, handler) => {
              let req = request;
              // system.transform：取当前系统消息文本，跑 hook，变更则替换 systemMessage（替换语义）
              if (sysHooks.length > 0) {
                const current = textOfMessage(req.systemMessage);
                const output = { system: current };
                for (const e of sysHooks)
                  await (e.fn as unknown as HookMap["system.transform"])(
                    { messages: req.state.messages, runtime: req.runtime },
                    output,
                  );
                if (output.system !== current)
                  req = {
                    ...req,
                    systemMessage: new SystemMessage(output.system),
                  };
              }
              // chat.params：攒采样参数，合并进 modelSettings
              if (paramHooks.length > 0) {
                const output: ChatParams = {};
                for (const e of paramHooks)
                  await (e.fn as unknown as HookMap["chat.params"])(
                    { messages: req.state.messages, runtime: req.runtime },
                    output,
                  );
                const settings = toModelSettings(output);
                if (Object.keys(settings).length > 0)
                  req = {
                    ...req,
                    modelSettings: { ...req.modelSettings, ...settings },
                  };
              }
              // tool.definition：逐个工具跑 hook，description 变更则浅克隆替换（保留原型链）
              if (defHooks.length > 0 && req.tools.length > 0) {
                const updated = [...req.tools];
                let changed = false;
                for (let i = 0; i < updated.length; i++) {
                  const t = updated[i] as { name?: string; description?: string };
                  const desc = t.description ?? "";
                  const output: { description: string; parameters?: unknown } = {
                    description: desc,
                  };
                  for (const e of defHooks)
                    await (e.fn as unknown as HookMap["tool.definition"])(
                      { name: t.name ?? "", runtime: req.runtime },
                      output,
                    );
                  if (output.description !== desc) {
                    updated[i] = Object.assign(
                      Object.create(Object.getPrototypeOf(updated[i])),
                      updated[i],
                      { description: output.description },
                    ) as (typeof updated)[number];
                    changed = true;
                  }
                }
                if (changed) req = { ...req, tools: updated };
              }
              return handler(req);
            },
          }
        : {}),
      ...(needTool || needEmit
        ? {
            wrapToolCall: async (request, handler) => {
              const id = request.toolCall.id ?? "";
              const name = request.toolCall.name;
              let toolCall = request.toolCall;
              // permission.ask：决策（deny 短路 / 改参）
              if (permHooks.length > 0) {
                const output: {
                  status: "allow" | "deny" | "ask";
                  reason?: string;
                  args?: Args;
                } = { status: "allow" };
                for (const e of permHooks) {
                  await (e.fn as unknown as HookMap["permission.ask"])(
                    {
                      tool: name,
                      args: toolCall.args,
                      toolCallId: id,
                      runtime: request.runtime,
                    },
                    output,
                  );
                  if (output.status === "deny")
                    return new ToolMessage({
                      content: `Blocked by plugin "${e.plugin}": ${output.reason ?? "permission denied"}`,
                      tool_call_id: id,
                      status: "error",
                    });
                }
                // "ask" 无内置 HITL：退化为放行（真正人工确认用 deepagents interruptOn + checkpointer）
                if (output.args) toolCall = { ...toolCall, args: output.args };
              }
              const req =
                toolCall === request.toolCall ? request : { ...request, toolCall };

              if (needEmit)
                emitBus.emit("tool_start", {
                  type: "tool_start",
                  id,
                  name,
                  input: toolCall.args,
                });
              const t0 = Date.now();
              let result = await handler(req);
              if (result instanceof ToolMessage) {
                if (needEmit) {
                  const { ok, content, data } = readToolMessage(result);
                  emitBus.emit("tool_end", {
                    type: "tool_end",
                    id,
                    name,
                    ok,
                    content,
                    ...(data !== undefined ? { data } : {}),
                    durationMs: Date.now() - t0,
                  });
                }
                if (afterHooks.length > 0) {
                  const output = { result };
                  for (const e of afterHooks)
                    await (e.fn as unknown as HookMap["tool.execute.after"])(
                      {
                        tool: name,
                        args: toolCall.args,
                        toolCallId: id,
                        runtime: request.runtime,
                      },
                      output,
                    );
                  result = output.result;
                }
              }
              return result;
            },
          }
        : {}),
      ...(needStart
        ? {
            beforeAgent: async (state, runtime) => {
              for (const e of startHooks)
                await (e.fn as unknown as HookMap["agent.start"])({
                  messages: state.messages,
                  runtime,
                });
            },
          }
        : {}),
      ...(needEnd
        ? {
            afterAgent: async (state, runtime) => {
              for (const e of endHooks)
                await (e.fn as unknown as HookMap["agent.end"])({
                  messages: state.messages,
                  runtime,
                });
            },
          }
        : {}),
    });
  }

  /** 为某个插件构造 {@link PluginApi}（注册写入本管理器，并记入 `added` 供 teardown）。 */
  private makeApi(
    plugin: Plugin,
    added: Added,
    clients: MultiServerMCPClient[],
  ): PluginApi {
    const name = plugin.name;
    const tools = this.tools;
    const hooksMap = this.hooks;
    const emitBus = this.bus;
    // 把一个 handler 注册到指定 hook 桶（所有命名空间方法共用此入口）。
    const register = (
      hookName: HookName,
      handler: unknown,
      opts?: { order?: Order },
    ): void => {
      const entry: Entry<StoredHook> = {
        fn: handler as StoredHook,
        order: opts?.order ?? "default",
        plugin: name,
      };
      const bucket = hooksMap.get(hookName);
      if (bucket) bucket.push(entry);
      else hooksMap.set(hookName, [entry]);
      added.hooks.push([hookName, entry]);
    };
    return {
      name,
      context: { cwd: process.cwd() },
      addTool: (tool) => {
        if (tools.has(tool.name)) {
          warn(name, `tool "${tool.name}" overrides an already-registered tool`);
        }
        tools.register(tool);
      },
      addModel: (alias, model) => {
        this.models.register(alias, model);
      },
      addMcp: async (servers) => {
        // 动态 import：内核不在顶层依赖 capabilities（消除循环）+ 按需懒加载
        const { Mcp } = await import("../capabilities/mcp");
        clients.push(await Mcp.register(servers, {}, tools));
      },
      setSearch: async (provider) => {
        const { setSearchProvider } = await import(
          "../capabilities/tools/search"
        );
        setSearchProvider(provider);
      },
      setSandbox: () => {
        warn(
          name,
          "setSandbox: backend is wired per-agent via build({ backend }); a plugin cannot set it globally",
        );
      },
      modifySpec: (fn, o) => {
        const entry: Entry<SpecModifier> = {
          fn,
          order: o?.order ?? "default",
          plugin: name,
        };
        this.specMods.push(entry);
        added.spec.push(entry);
      },
      // 运行时 hook：transform 命名空间 + 顶层方法，内部归一到 HookMap 点分名
      transform: {
        system: (handler, o) => register("system.transform", handler, o),
        params: (handler, o) => register("chat.params", handler, o),
        tool: (handler, o) => register("tool.definition", handler, o),
      },
      permission: (handler, o) => register("permission.ask", handler, o),
      result: (handler, o) => register("tool.execute.after", handler, o),
      start: (handler, o) => register("agent.start", handler, o),
      end: (handler, o) => register("agent.end", handler, o),
      // "event"：直接订阅事件总线（不进 hook 桶/中间件），teardown 时解绑
      event: (handler) => {
        const off = emitBus.watch((_type, payload) =>
          handler({ event: payload as Event }),
        );
        added.busUnsubs.push(off);
      },
      expose: (id, value) => {
        this.exposed.set(id, value);
        added.exposedKeys.push(id);
      },
      useExposed: <T>(id: string) => this.exposed.get(id) as T | undefined,
    };
  }
}

/**
 * 插件注册表。与 {@link ToolRegistry}/{@link ModelRegistry}/{@link MiddlewareRegistry}
 * 对称：以插件 `name` 为键登记「装配过哪些插件」，供自省与去重。
 */
export class PluginRegistry {
  private readonly items = new Map<string, Plugin>();

  register(plugin: Plugin): this {
    this.items.set(plugin.name, plugin);
    return this;
  }
  has(name: string): boolean {
    return this.items.has(name);
  }
  get(name: string): Plugin | undefined {
    return this.items.get(name);
  }
  all(): Plugin[] {
    return [...this.items.values()];
  }
}

/** 进程级共享的插件注册表。 */
export const plugins = new PluginRegistry();

/** 进程级共享的插件管理器（{@link build} 装配时咨询它）。 */
export const manager = new PluginManager();

/**
 * 装配一组插件到全局 {@link manager}：拓扑排序 → 依序跑 setup → 收集贡献与 hooks。
 * 之后 `Agent.create(...)` 会自动应用其 `modifySpec` 与编译出的 hooks 中间件。
 *
 * ```ts
 * const off = await use([myPlugin, await import("@x/plugin").then((m) => m.default)]);
 * const agent = await Agent.create("search"); // 插件的工具/hooks 已生效
 * await off(); // 移除本批 hooks/exposed、解绑 bus 订阅、关闭其 MCP 连接
 * ```
 */
export function use(list: Plugin[]): Promise<Teardown> {
  return manager.use(list);
}
