/**
 * 插件层 —— rsbuild 风格的插件架构。
 *
 * 一个 {@link Plugin} = `{ name, pre?, post?, setup(api) }`。**没有静态贡献字段**，一切
 * 通过 `setup(api)` 命令式声明（对齐 rsbuild：`api.addTool` / `api.modifyXxx` / `api.onXxx`）。
 *
 * 两类介入：
 *  - **贡献**：`addTool` / `addModel` / `addMcp` / `setSearch`（进进程级注册表）；
 *  - **生命周期 hooks**：`modifyPrompt` / `modifyToolCall` / `onToolResult` / `onStart` / `onEnd`
 *    —— 它们被**编译成一个 LangChain `createMiddleware`**（贴合 DeepAgent 底座，不自造 hook 总线），
 *    经 {@link build} 自动挂到 agent 上；`modifySpec` 则在装配期链式改 {@link AgentSpec}。
 *
 * 顺序：插件间用 `pre`/`post` 声明依赖（装配前拓扑排序）；同一阶段多个 hook 用 `order`
 *（`pre`/`default`/`post`）排序。插件间可用 `expose`/`useExposed` 共享值。
 *
 * 生效：`await use([...])` 跑插件 setup → 收集贡献与 hooks 进全局 {@link manager}；其后
 * `Agent.create(...)` 装配时自动应用（`manager.applySpec` + `manager.middleware()`）。
 */
import { SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredTool } from "@langchain/core/tools";
import type { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { AnyBackendProtocol } from "deepagents";
import { createMiddleware, type AgentMiddleware } from "langchain";

import type { McpServers } from "../capabilities/mcp";
import { models as defaultModels, ModelRegistry, type ModelRef } from "./model";
import { registry as defaultRegistry, ToolRegistry } from "./registry";
import type { SearchProvider } from "../capabilities/tools/search";
import type { AgentSpec } from "../types";

/** 钩子在所属阶段内的执行序：`pre` 最先、`post` 最后、`default` 居中。 */
export type Order = "pre" | "default" | "post";

/** 插件卸载函数：移除本批注册的 hooks/modifiers/exposed 并关闭其 MCP 连接。 */
export type Teardown = () => Promise<void>;

/** `modifyToolCall` 的返回：放行（void）/ 拒绝（回填 error）/ 改参后放行。 */
export type ToolGate =
  | void
  | { deny: string }
  | { args: Record<string, unknown> };

/** 运行时 hook 的公共上下文。`runtime` 为中间件运行时（含 context/signal 等）。 */
interface RuntimeCtx {
  messages: BaseMessage[];
  runtime: unknown;
}
/** 一次工具调用（modifyToolCall 的入参）。 */
interface ToolCallCtx {
  name: string;
  args: Record<string, unknown>;
  id: string;
  runtime: unknown;
}
/** 工具结果（onToolResult 的入参）。 */
interface ToolResultCtx {
  name: string;
  args: Record<string, unknown>;
  result: ToolMessage;
  runtime: unknown;
}

type SpecModifier = (spec: AgentSpec) => AgentSpec | void;
type PromptHook = (ctx: RuntimeCtx) => string | Promise<string>;
type ToolCallHook = (call: ToolCallCtx) => ToolGate | Promise<ToolGate>;
type ToolResultHook = (
  e: ToolResultCtx,
) => void | ToolMessage | Promise<void | ToolMessage>;
type LifecycleHook = (ctx: RuntimeCtx) => void | Promise<void>;

/** 注册项：带 `order` 与来源 `plugin`，便于排序与卸载。 */
interface Entry<T> {
  fn: T;
  order: Order;
  plugin: string;
}

/**
 * `setup(api)` 拿到的把手。rsbuild 式：贡献用 `addXxx`，装配期修改用 `modifySpec`，
 * 运行时介入用 `modify*` 与 `on*` hooks，插件间通信用 `expose/useExposed`。
 * 每个注册方法可选 `{ order }` 控制同阶段内执行序。
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

  // —— 运行时 hooks（编译成 middleware）——
  /** 每轮模型调用前，返回要追加到系统提示词末尾的文本（链式）。 */
  modifyPrompt(fn: PromptHook, opts?: { order?: Order }): void;
  /** 工具调用前：放行 / 拒绝 / 改参。 */
  modifyToolCall(fn: ToolCallHook, opts?: { order?: Order }): void;
  /** 工具调用后：观察，或返回新 ToolMessage 替换结果。 */
  onToolResult(fn: ToolResultHook, opts?: { order?: Order }): void;
  /** agent 开始时触发一次。 */
  onStart(fn: LifecycleHook, opts?: { order?: Order }): void;
  /** agent 结束时触发一次。 */
  onEnd(fn: LifecycleHook, opts?: { order?: Order }): void;

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

/**
 * 插件管理器：跑 setup、收集贡献与 hooks、把 hooks 编译成中间件、装配期改 spec。
 * 进程级单例为 {@link manager}；可 `new` 出独立实例用于隔离测试。
 */
export class PluginManager {
  private readonly specMods: Entry<SpecModifier>[] = [];
  private readonly promptHooks: Entry<PromptHook>[] = [];
  private readonly toolCallHooks: Entry<ToolCallHook>[] = [];
  private readonly toolResultHooks: Entry<ToolResultHook>[] = [];
  private readonly startHooks: Entry<LifecycleHook>[] = [];
  private readonly endHooks: Entry<LifecycleHook>[] = [];
  private readonly exposed = new Map<string, unknown>();

  constructor(
    private readonly tools: ToolRegistry = defaultRegistry,
    private readonly models: ModelRegistry = defaultModels,
  ) {}

  /** 装配一组插件：拓扑排序 → 依序 setup → 收集贡献/hooks。返回 {@link Teardown}。 */
  async use(list: Plugin[]): Promise<Teardown> {
    const ordered = topoSort(list);
    const clients: MultiServerMCPClient[] = [];
    // 记录本批注册的 Entry/键，供 teardown 精确移除
    const added = {
      spec: [] as Entry<SpecModifier>[],
      prompt: [] as Entry<PromptHook>[],
      toolCall: [] as Entry<ToolCallHook>[],
      toolResult: [] as Entry<ToolResultHook>[],
      start: [] as Entry<LifecycleHook>[],
      end: [] as Entry<LifecycleHook>[],
      exposedKeys: [] as string[],
    };

    for (const plugin of ordered) {
      plugins.register(plugin);
      await plugin.setup(this.makeApi(plugin, added, clients));
    }

    return async () => {
      const drop = <T>(arr: Entry<T>[], rm: Entry<T>[]) => {
        for (const e of rm) {
          const i = arr.indexOf(e);
          if (i >= 0) arr.splice(i, 1);
        }
      };
      drop(this.specMods, added.spec);
      drop(this.promptHooks, added.prompt);
      drop(this.toolCallHooks, added.toolCall);
      drop(this.toolResultHooks, added.toolResult);
      drop(this.startHooks, added.start);
      drop(this.endHooks, added.end);
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

  /** 把当前所有运行时 hooks 编译成一个中间件；无 hooks 时返回 undefined。 */
  middleware(): AgentMiddleware | undefined {
    const prompt = byOrder(this.promptHooks);
    const toolCall = byOrder(this.toolCallHooks);
    const toolResult = byOrder(this.toolResultHooks);
    const start = byOrder(this.startHooks);
    const end = byOrder(this.endHooks);
    if (
      !prompt.length &&
      !toolCall.length &&
      !toolResult.length &&
      !start.length &&
      !end.length
    ) {
      return undefined;
    }

    return createMiddleware({
      name: "plugins",
      ...(prompt.length
        ? {
            wrapModelCall: async (request, handler) => {
              let sys = request.systemMessage;
              for (const e of prompt) {
                const extra = await e.fn({
                  messages: request.state.messages,
                  runtime: request.runtime,
                });
                if (extra) sys = sys.concat(new SystemMessage(`\n\n${extra}`));
              }
              return handler(
                sys === request.systemMessage
                  ? request
                  : { ...request, systemMessage: sys },
              );
            },
          }
        : {}),
      ...(toolCall.length || toolResult.length
        ? {
            wrapToolCall: async (request, handler) => {
              let req = request;
              const id = req.toolCall.id ?? "";
              for (const e of toolCall) {
                const gate = await e.fn({
                  name: req.toolCall.name,
                  args: req.toolCall.args,
                  id,
                  runtime: req.runtime,
                });
                if (gate && "deny" in gate) {
                  return new ToolMessage({
                    content: `Blocked by plugin "${e.plugin}": ${gate.deny}`,
                    tool_call_id: id,
                    status: "error",
                  });
                }
                if (gate && "args" in gate) {
                  req = { ...req, toolCall: { ...req.toolCall, args: gate.args } };
                }
              }
              let result = await handler(req);
              if (toolResult.length && result instanceof ToolMessage) {
                for (const e of toolResult) {
                  const replaced = await e.fn({
                    name: req.toolCall.name,
                    args: req.toolCall.args,
                    result,
                    runtime: req.runtime,
                  });
                  if (replaced) result = replaced;
                }
              }
              return result;
            },
          }
        : {}),
      ...(start.length
        ? {
            beforeAgent: async (state, runtime) => {
              for (const e of start)
                await e.fn({ messages: state.messages, runtime });
            },
          }
        : {}),
      ...(end.length
        ? {
            afterAgent: async (state, runtime) => {
              for (const e of end)
                await e.fn({ messages: state.messages, runtime });
            },
          }
        : {}),
    });
  }

  /** 为某个插件构造 {@link PluginApi}（注册写入本管理器，并记入 `added` 供 teardown）。 */
  private makeApi(
    plugin: Plugin,
    added: {
      spec: Entry<SpecModifier>[];
      prompt: Entry<PromptHook>[];
      toolCall: Entry<ToolCallHook>[];
      toolResult: Entry<ToolResultHook>[];
      start: Entry<LifecycleHook>[];
      end: Entry<LifecycleHook>[];
      exposedKeys: string[];
    },
    clients: MultiServerMCPClient[],
  ): PluginApi {
    const name = plugin.name;
    const tools = this.tools;
    const tap = <T>(
      pool: Entry<T>[],
      bucket: Entry<T>[],
      fn: T,
      order: Order,
    ): void => {
      const entry: Entry<T> = { fn, order, plugin: name };
      pool.push(entry);
      bucket.push(entry);
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
      modifySpec: (fn, o) =>
        tap(this.specMods, added.spec, fn, o?.order ?? "default"),
      modifyPrompt: (fn, o) =>
        tap(this.promptHooks, added.prompt, fn, o?.order ?? "default"),
      modifyToolCall: (fn, o) =>
        tap(this.toolCallHooks, added.toolCall, fn, o?.order ?? "default"),
      onToolResult: (fn, o) =>
        tap(this.toolResultHooks, added.toolResult, fn, o?.order ?? "default"),
      onStart: (fn, o) =>
        tap(this.startHooks, added.start, fn, o?.order ?? "default"),
      onEnd: (fn, o) =>
        tap(this.endHooks, added.end, fn, o?.order ?? "default"),
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
 * await off(); // 移除本批 hooks/exposed、关闭其 MCP 连接
 * ```
 */
export function use(list: Plugin[]): Promise<Teardown> {
  return manager.use(list);
}
