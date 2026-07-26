/**
 * 插件管理器:装配 / 作用域 / 热重载 / 跨插件通信 / 错误隔离。
 *
 * 顺序由 {@link Ordering} 决定,并以两种形式生效:setup 按 {@link Ordering.layers} 逐层推进;
 * 每个 hook 内 tap 的默认次序 = 插件的图序(经 {@link Hook.weigh} 注入),增删插件后靠 `epoch`
 * 自动重排。
 *
 * 派发次序只由图决定、与 setup 先后无关,因此同层插件并发 setup 不改变任何 hook 的执行顺序 ——
 * 这是 `concurrent` 敢开的前提。
 */

import { HookMap, type Hook, type Probe, type TapOptions } from "./hook";
import { Ordering, type OrderCode } from "./order";
import type { Context, Hooks, Host, Plugin, Tappable } from "./plugin";

interface Scope {
  untaps: Array<() => void>;
  disposers: Array<() => void | Promise<void>>;
  provided: string[];
  controller: AbortController;
}

interface Entry<H extends Hooks, C extends Host> {
  plugin: Plugin<H, C, any>;
  options: unknown;
}

/** 装配项:插件本身,或 `[插件, 选项]`。 */
export type Install<H extends Hooks, C extends Host> =
  | Plugin<H, C, any>
  | readonly [Plugin<H, C, any>, unknown];

export interface ManagerOptions {
  /**
   * 同一 `(bucket, layer)` 的插件并发 setup。默认串行。
   *
   * @remarks 唯一要求:跨插件 `provide` / `consume` 必须靠 `after` 声明出来,否则同层就是竞态。
   */
  concurrent?: boolean | undefined;
  /** 装到每个 hook 上的派发探针。 */
  probe?: Probe | undefined;
}

export class PluginManager<H extends Hooks, C extends Host = Host> {
  /** 插件依赖图,可直接读顺序码与分层做自省。 */
  public readonly order = new Ordering();

  private readonly registered = new Map<string, Entry<H, C>>();
  private readonly scopes = new Map<string, Scope>();
  private readonly shared = new Map<string, unknown>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly concurrent: boolean;

  public constructor(
    public readonly hooks: H,
    private readonly host: C,
    options: ManagerOptions = {},
  ) {
    this.concurrent = options.concurrent ?? false;
    // Hook 与 HookMap 都有 weigh / probe,故这里不必分辨槽位形态。
    for (const key of Object.keys(hooks)) {
      const slot = hooks[key]!;
      slot.weigh(this.order);
      if (options.probe) slot.probe = options.probe;
    }
  }

  /**
   * 装配一批插件:入图 → 校验 → 按层 setup。返回批量卸载(逆序)。
   *
   * 校验失败会把本批新增的全部撤掉,因此 `use()` 要么整批生效,要么什么都不留。
   */
  public async use(list: readonly Install<H, C>[]): Promise<() => Promise<void>> {
    const fresh: Entry<H, C>[] = [];
    for (const item of list) {
      const [plugin, options] = Array.isArray(item)
        ? (item as readonly [Plugin<H, C, any>, unknown])
        : ([item as Plugin<H, C, any>, undefined] as const);
      if (this.registered.has(plugin.name)) continue;
      if (plugin.apply && !plugin.apply(this.host)) continue;
      fresh.push({ plugin, options });
    }
    if (fresh.length === 0) return async () => {};

    // 只入点,不连边 —— 依赖边在读顺序时按声明整体重连,前向引用因此自然成立。
    this.order.batch(() => {
      for (const { plugin } of fresh) this.order.add(plugin);
    });

    try {
      this.order.verify();
    } catch (error) {
      this.order.batch(() => {
        for (const { plugin } of fresh) this.order.remove(plugin.name);
      });
      throw error;
    }

    const waiting = new Map(fresh.map((entry) => [entry.plugin.name, entry]));
    const done: string[] = [];
    for (const layer of this.order.layers()) {
      const batch: Entry<H, C>[] = [];
      for (const name of layer) {
        const entry = waiting.get(name);
        if (entry) batch.push(entry);
      }
      if (batch.length === 0) continue;
      for (const entry of batch) done.push(entry.plugin.name);
      if (this.concurrent && batch.length > 1) {
        await Promise.all(batch.map((entry) => this.install(entry)));
      } else {
        for (const entry of batch) await this.install(entry);
      }
    }

    const unload = async (): Promise<void> => {
      for (const name of [...done].reverse()) await this.unload(name);
    };
    try {
      // tap 之间的先后声明也在装配边界上校验,派发时不再有意外。
      for (const key of Object.keys(this.hooks)) this.hooks[key]!.verify();
    } catch (error) {
      await unload();
      throw error;
    }
    return unload;
  }

  /** 热重载:同名加锁 → 关旧 scope → 重跑 setup。图不动,顺序不变。 */
  public reload(name: string): Promise<boolean> {
    return this.lock(name, async () => {
      const entry = this.registered.get(name);
      if (!entry) return false;
      await this.close(name);
      await this.setup(entry); // 再失败则该插件停在"已卸载"状态
      return true;
    });
  }

  public unload(name: string): Promise<void> {
    return this.lock(name, async () => {
      await this.close(name);
      this.registered.delete(name);
      this.order.remove(name);
    });
  }

  /** 按图序逆序卸载全部,让消费者先于提供者退场。 */
  public async dispose(): Promise<void> {
    // 图节点是权威清单:登记表恒为它的子集。
    for (const name of [...this.order.sorted()].reverse()) await this.unload(name);
  }

  public list(): readonly string[] {
    return this.order.sorted();
  }

  public codes(): ReadonlyMap<string, OrderCode> {
    return this.order.codes();
  }

  /** 建 scope 跑 setup;失败则回滚该插件已注册的 tap 与资源。 */
  private async setup(entry: Entry<H, C>): Promise<void> {
    const { plugin, options } = entry;
    const scope: Scope = {
      untaps: [],
      disposers: [],
      provided: [],
      controller: new AbortController(),
    };
    this.scopes.set(plugin.name, scope);
    try {
      await plugin.setup(this.api(plugin, scope), options as never);
    } catch (error) {
      this.host.logger?.error(`插件 "${plugin.name}" setup 失败: ${String(error)}`);
      await this.close(plugin.name);
      throw error;
    }
  }

  /** 首次装配:登记 + setup;失败则连登记与图节点一起撤销。 */
  private async install(entry: Entry<H, C>): Promise<void> {
    this.registered.set(entry.plugin.name, entry);
    try {
      await this.setup(entry);
    } catch (error) {
      this.registered.delete(entry.plugin.name);
      this.order.remove(entry.plugin.name);
      throw error;
    }
  }

  private async close(name: string): Promise<void> {
    const scope = this.scopes.get(name);
    if (!scope) return;
    this.scopes.delete(name);
    scope.controller.abort();
    for (const off of scope.untaps) off();
    for (const dispose of [...scope.disposers].reverse()) {
      try {
        await dispose();
      } catch (error) {
        this.host.logger?.error(`插件 "${name}" 清理失败: ${String(error)}`);
      }
    }
    for (const key of scope.provided) this.shared.delete(key);
  }

  private api(plugin: Plugin<H, C, any>, scope: Scope): Context<H, C> {
    // name 由管理器接管:tap 的身份就是它的插件,写别的名字只会让权重查不到。
    const bind = (hook: Hook<any, any>) => ({
      tap: (options: TapOptions<unknown>, fn: never): (() => void) => {
        const off = hook.tap({ ...options, name: plugin.name }, fn);
        scope.untaps.push(off);
        return off;
      },
    });

    const view: Record<string, unknown> = {};
    for (const key of Object.keys(this.hooks)) {
      const slot = this.hooks[key]!;
      view[key] =
        slot instanceof HookMap ? { for: (name: string) => bind(slot.for(name)) } : bind(slot);
    }

    return {
      name: plugin.name,
      host: this.host,
      hooks: view as Tappable<H>,
      signal: scope.controller.signal,
      onDispose: (fn) => void scope.disposers.push(fn),
      provide: (key, value) => {
        this.shared.set(key, value);
        scope.provided.push(key);
      },
      consume: <T,>(key: string): T | undefined => this.shared.get(key) as T | undefined,
      has: (name) => this.registered.has(name),
    };
  }

  private lock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const next = (this.locks.get(key) ?? Promise.resolve()).then(work, work);
    this.locks.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }
}
