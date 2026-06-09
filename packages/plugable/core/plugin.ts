/**
 * 插件定义与上下文。
 *
 * 一个插件 = `{ name, pre?, post?, enforce?, apply?, setup(api) }`。一切通过 `setup(api)`
 * 命令式声明:用 `api.hooks.<name>.tap(...)` 注册回调,用 `expose` / `useExposed` 跨插件通信,
 * 用 `onDispose` / `signal` 管理生命周期。
 */

import type { Hook } from "./hook";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Host 注入给插件的只读上下文;host 可经索引签名挂载任意资源。 */
export interface HostContext {
  readonly cwd: string;
  readonly mode?: string | undefined;
  readonly logger?: Logger | undefined;
  readonly [key: string]: unknown;
}

/** 一组具名 hook(由 host 声明)。 */
export type Hooks = Record<string, Hook<any, any>>;

/** 给插件的"只可 tap"视图:插件能 `tap`,不能 `call`(call 是 host 的特权)。 */
export type Tappable<H extends Hooks> = {
  readonly [K in keyof H]: Pick<H[K], "tap">;
};

/** `setup(api)` 拿到的把手。 */
export interface PluginContext<H extends Hooks, C extends HostContext = HostContext> {
  readonly name: string;
  readonly options: unknown;
  readonly context: C;
  /** 本插件的 hooks 视图;tap 自动归属本插件、随热重载 / 卸载清理。 */
  readonly hooks: Tappable<H>;
  /** 卸载 / 重载 / host 关停时 abort(透传给长生命周期资源)。 */
  readonly signal: AbortSignal;
  /** 注册清理;卸载时按注册逆序执行。 */
  onDispose(fn: () => void | Promise<void>): void;
  /** 暴露 / 获取跨插件共享值(靠 pre/post 保证时序)。 */
  expose<T>(key: string, value: T): void;
  useExposed<T = unknown>(key: string): T | undefined;
  /** 是否已装配某插件。 */
  hasPlugin(name: string): boolean;
}

/** 插件定义。 */
export interface Plugin<H extends Hooks = Hooks, C extends HostContext = HostContext, O = unknown> {
  name: string;
  version?: string | undefined;
  /** 须先于本插件 setup 的插件名。 */
  pre?: string[] | undefined;
  /** 须后于本插件 setup 的插件名。 */
  post?: string[] | undefined;
  /** 粗粒度硬分相(先于 pre/post 应用)。 */
  enforce?: "pre" | "post" | undefined;
  /** 条件装配,返回 false 跳过。 */
  apply?: ((context: C) => boolean) | undefined;
  setup(api: PluginContext<H, C>, options: O): void | Promise<void>;
}

/** 类型收窄恒等函数(便于推断 H / O)。 */
export function definePlugin<H extends Hooks, C extends HostContext = HostContext, O = unknown>(
  plugin: Plugin<H, C, O>,
): Plugin<H, C, O> {
  return plugin;
}
