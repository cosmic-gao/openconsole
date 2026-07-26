/**
 * 插件定义与上下文。
 *
 * 一个插件 = `{ name, enforce?, before?, after?, apply?, setup(api, options) }`。一切通过
 * `setup` 命令式声明 —— 注册什么、注册几个、按什么条件注册,全在插件自己手里。这是 esbuild
 * 的形态,而不是一堆生命周期字段的对象。
 */

import type { Hook, HookMap } from "./hook";
import type { Ordered } from "./order";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Host 注入给插件的只读上下文。要挂自己的资源就扩展它,并把扩展类型传给 {@link PluginManager}。 */
export interface Host {
  readonly cwd: string;
  readonly mode?: string | undefined;
  readonly logger?: Logger | undefined;
}

/** 一组具名 hook,由 host 声明。槽位可以是单个 {@link Hook},也可以是一组 {@link HookMap}。 */
export type Hooks = Record<string, Hook<any, any> | HookMap<any>>;

/** 单个槽位的只可注册视图。 */
type View<S> = S extends HookMap<infer T>
  ? { for(key: string): Pick<T, "tap"> }
  : S extends Hook<any, any>
    ? Pick<S, "tap">
    : never;

/** 给插件的只可注册视图 —— `call` 是 host 的特权。 */
export type Tappable<H extends Hooks> = {
  readonly [K in keyof H]: View<H[K]>;
};

/** `setup(api)` 拿到的把手。 */
export interface Context<H extends Hooks, C extends Host = Host> {
  readonly name: string;
  readonly host: C;
  /** tap 恒归属本插件:`name` 由管理器接管,写了也会被覆盖。 */
  readonly hooks: Tappable<H>;
  /** 卸载 / 重载 / host 关停时 abort。 */
  readonly signal: AbortSignal;
  /** 卸载时按注册逆序执行。 */
  onDispose(fn: () => void | Promise<void>): void;
  /** 暴露跨插件共享值;卸载时自动撤下。 */
  provide<T>(key: string, value: T): void;
  /** 时序靠 `after` 保证 —— 没声明依赖就可能还没被 provide。 */
  consume<T = unknown>(key: string): T | undefined;
  has(name: string): boolean;
}

export interface Plugin<H extends Hooks = Hooks, C extends Host = Host, O = unknown>
  extends Ordered {
  readonly name: string;
  /** 返回 false 则整个插件跳过。 */
  readonly apply?: ((host: C) => boolean) | undefined;
  setup(api: Context<H, C>, options: O): void | Promise<void>;
}

/** 类型收窄恒等函数,便于推断 `H` / `O`。 */
export function definePlugin<H extends Hooks, C extends Host = Host, O = unknown>(
  plugin: Plugin<H, C, O>,
): Plugin<H, C, O> {
  return plugin;
}
