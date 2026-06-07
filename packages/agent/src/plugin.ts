/**
 * 插件层 —— 把现有六个「散装」扩展点收拢成一个一等抽象。
 *
 * 现状：扩展功能要分别调 `registry.register`（工具）、`models.register`（模型）、
 * `middlewares.register`（中间件）、`setSearchProvider`（搜索后端）、`Sandbox.adapt`
 * （沙箱后端）、`Mcp.register`（MCP 工具）——六处互不相干，无命名空间、无生命周期、
 * 无法打包分发。
 *
 * 一个 {@link Plugin} = 「一组贡献声明」+ 「一个可选异步 setup」。它**不是新的运行时
 * 抽象**：setup 拿到的把手就是现有的 {@link ToolRegistry}/{@link ModelRegistry}/
 * {@link MiddlewareRegistry}，插件只是「一次声明、批量登记」。一个插件就是一个导出
 * {@link Plugin} 对象的模块，可经 npm 分发（对齐 opencode / claude code 的插件模型）。
 *
 * 两条装配路径，职责分明：
 *  - {@link use}（异步、全局、可 teardown）：唯一会跑 `setup`、连 MCP 的入口。装好后
 *    `.agent` 即可按名引用插件贡献的工具、用插件的模型别名。
 *  - `build({ plugins })`（同步、单 agent）：只取插件的**纯静态贡献**（tools + middleware）
 *    装到这一个 agent 上，不跑 setup、不连 MCP。见 {@link collect} 与 ./build。
 */
import type { StructuredTool } from "@langchain/core/tools";
import type { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { AnyBackendProtocol } from "deepagents";
import type { AgentMiddleware } from "langchain";

import { Mcp, type McpServers } from "./mcp";
import { middlewares as defaultMiddlewares, MiddlewareRegistry } from "./middleware";
import { models as defaultModels, ModelRegistry, type ModelRef } from "./model";
import { registry as defaultRegistry, ToolRegistry } from "./registry";
import { setSearchProvider, type SearchProvider } from "./tools/search";

/** 插件卸载函数：关 MCP 连接、释放 setup 占用的资源。{@link use} 把多个插件的 teardown 合一返回。 */
export type Teardown = () => Promise<void>;

/**
 * `setup(ctx)` 拿到的把手：就是现有的几个注册表 + 两个接口替换点，零新概念。
 * 插件在 setup 里通过它做需要 IO 的初始化（连 MCP、动态 import、读盘）。
 */
export interface PluginContext {
  /** 工具注册表（贡献的工具进这里，`.agent` 可按名引用）。 */
  tools: ToolRegistry;
  /** 模型注册表（贡献的别名进这里）。 */
  models: ModelRegistry;
  /** 中间件注册表（贡献的中间件按 name 进这里）。 */
  middlewares: MiddlewareRegistry;
  /** 替换网页搜索后端（Tavily / SearxNG / Brave…）。 */
  search: (provider: SearchProvider) => void;
  /** 替换文件系统/沙箱 backend（接自托管 Docker/gVisor 等，经 `Sandbox.adapt`）。 */
  sandbox: (backend: AnyBackendProtocol) => void;
  /** 连接一组 MCP server 并把工具注册进 {@link PluginContext.tools}；连接会在 teardown 时自动关闭。 */
  mcp: (servers: McpServers) => Promise<void>;
}

/**
 * 插件定义。静态字段（tools / models / middleware）在装配时同步登记；需要 IO 的
 * （mcp、动态 import、读盘）放进 {@link Plugin.setup}。
 */
export interface Plugin {
  /** 插件名：日志、{@link PluginRegistry} 去重键。 */
  name: string;
  /** 贡献的工具实例（按名进 tools 注册表）。 */
  tools?: StructuredTool[];
  /** 贡献的模型别名 -> {@link ModelRef}。 */
  models?: Record<string, ModelRef>;
  /** 贡献的中间件（`Hook.middleware` / `guard` / `horizon` / `observe` 编译后都是它）。 */
  middleware?: AgentMiddleware[];
  /** 贡献的 MCP servers（在 setup 阶段连接，工具注册进 tools；teardown 自动关闭）。 */
  mcp?: McpServers;
  /** 异步初始化：需要 IO / 动态 import 时用。返回可选的 {@link Teardown}。 */
  setup?: (ctx: PluginContext) => void | Teardown | Promise<void | Teardown>;
}

function warn(plugin: Plugin, message: string): void {
  console.warn(`[@openconsole/agent] plugin "${plugin.name}": ${message}`);
}

/**
 * 插件注册表。与 {@link ToolRegistry}/{@link ModelRegistry}/{@link MiddlewareRegistry}
 * 对称：以插件 `name` 为键登记「已装配过哪些插件」，供自省与去重。
 */
export class PluginRegistry {
  private readonly items = new Map<string, Plugin>();

  /** 以插件 `name` 为键登记。返回 `this` 以便链式调用。 */
  register(plugin: Plugin): this {
    this.items.set(plugin.name, plugin);
    return this;
  }

  /** 该名字的插件是否已登记。 */
  has(name: string): boolean {
    return this.items.has(name);
  }

  /** 按名取回插件。 */
  get(name: string): Plugin | undefined {
    return this.items.get(name);
  }

  /** 所有已登记的插件。 */
  all(): Plugin[] {
    return [...this.items.values()];
  }
}

/** 进程级共享的插件注册表（{@link use} 装配过的插件都登记于此）。 */
export const plugins = new PluginRegistry();

/** {@link use} 的目标注册表（缺省走进程级共享的那几个）。便于测试与多实例隔离。 */
export interface UseTarget {
  tools?: ToolRegistry;
  models?: ModelRegistry;
  middlewares?: MiddlewareRegistry;
}

/** 用一组注册表 + MCP client 累积器构造 {@link PluginContext}。 */
function makeContext(
  tools: ToolRegistry,
  models: ModelRegistry,
  middlewares: MiddlewareRegistry,
  clients: MultiServerMCPClient[],
): PluginContext {
  return {
    tools,
    models,
    middlewares,
    search: setSearchProvider,
    // sandbox backend 是「按 agent 传值」的（build({ backend })），没有进程级单例可换；
    // 这里把它作为一个显式的 no-op 占位 + 告警，提示插件作者经 build/create 的 backend 选项接线。
    sandbox: () => {
      console.warn(
        "[@openconsole/agent] PluginContext.sandbox: backend is wired per-agent via build({ backend }); a plugin cannot set it globally.",
      );
    },
    async mcp(servers) {
      clients.push(await Mcp.register(servers, {}, tools));
    },
  };
}

/** 合并一个插件的静态贡献并跑其 setup，返回该插件自身的 teardown（仅 setup 的返回值）。 */
async function apply(
  plugin: Plugin,
  ctx: PluginContext,
): Promise<Teardown | undefined> {
  if (plugin.tools) {
    for (const tool of plugin.tools) {
      if (ctx.tools.has(tool.name)) {
        warn(plugin, `tool "${tool.name}" overrides an already-registered tool`);
      }
      ctx.tools.register(tool);
    }
  }
  if (plugin.models) ctx.models.registerAll(plugin.models);
  if (plugin.middleware) ctx.middlewares.registerAll(plugin.middleware);
  if (plugin.mcp) await ctx.mcp(plugin.mcp);

  if (plugin.setup) {
    const result = await plugin.setup(ctx);
    if (typeof result === "function") return result;
  }
  return undefined;
}

/**
 * 把一组插件装配到**指定**注册表（默认走进程级共享的那几个）。{@link use} 的底层实现，
 * 也是测试/多实例隔离的入口。会跑每个插件的 `setup` 并连其声明的 MCP。
 *
 * 返回的 {@link Teardown} 会：先逆序跑各插件 setup 返回的清理函数，再关闭本次连接的所有 MCP client。
 */
/**
 * 把一组插件装配到注册表（默认进程级共享）。唯一会跑 `setup`、连 MCP 的入口。装好后
 * `.agent` 即可按名引用插件贡献的工具、用其模型别名，插件的 MCP server 也已连上。
 *
 * `target` 缺省走进程级共享的注册表；传独立注册表可做测试 / 多实例隔离。返回的 {@link Teardown}
 * 先逆序跑各插件 setup 返回的清理，再关闭本次连接的所有 MCP client。
 *
 * ```ts
 * const off = await use([myPlugin, await import("@x/plugin").then((m) => m.default)]);
 * const agent = await Agent.create("search"); // .agent 现在能引用插件工具
 * await off(); // 逆序卸载 + 关闭 MCP 连接
 * ```
 */
export async function use(
  list: Plugin[],
  target: UseTarget = {},
): Promise<Teardown> {
  const tools = target.tools ?? defaultRegistry;
  const models = target.models ?? defaultModels;
  const middlewares = target.middlewares ?? defaultMiddlewares;
  const clients: MultiServerMCPClient[] = [];
  const ctx = makeContext(tools, models, middlewares, clients);

  const teardowns: Teardown[] = [];
  for (const plugin of list) {
    plugins.register(plugin);
    const teardown = await apply(plugin, ctx);
    if (teardown) teardowns.push(teardown);
  }

  return async () => {
    // 逆序卸载（后装的先卸），再关 MCP 连接
    for (const teardown of teardowns.reverse()) await teardown();
    for (const client of clients) await client.close();
  };
}

/**
 * 收集一组插件的**纯静态贡献**（tools + middleware），供 `build({ plugins })` 同步装配到
 * 单个 agent。**不**跑 setup、**不**连 MCP —— 含 `mcp`/`setup` 的插件请先 `await use(plugin)`，
 * 这里只对它们告警。
 */
export function collect(list: Plugin[]): {
  tools: StructuredTool[];
  middleware: AgentMiddleware[];
} {
  const tools: StructuredTool[] = [];
  const middleware: AgentMiddleware[] = [];
  for (const plugin of list) {
    if (plugin.tools) tools.push(...plugin.tools);
    if (plugin.middleware) middleware.push(...plugin.middleware);
    if (plugin.mcp || plugin.setup) {
      warn(
        plugin,
        "has mcp/setup which build({ plugins }) ignores; call `await use(plugin)` for those",
      );
    }
  }
  return { tools, middleware };
}
