/**
 * 插件管理器:装配 / 作用域 / 热重载 / 跨插件通信 / 错误隔离。
 *
 * 顺序由 {@link PluginGraph} 决定;每个 hook 的默认 tap 顺序 = 插件的实时图序
 * (经 `resolveWeight` 注入),增删插件后自动反映,无需重标记。
 */

import type { Hook } from "./hook";
import { PluginGraph, type OrderNode } from "./ordering";
import type { Hooks, HostContext, Plugin, PluginContext, Tappable } from "./plugin";

interface Scope {
  untaps: Array<() => void>;
  disposers: Array<() => void | Promise<void>>;
  exposedKeys: string[];
  controller: AbortController;
}

interface Entry<H extends Hooks, C extends HostContext> {
  plugin: Plugin<H, C, any>;
  options: unknown;
}

type PluginInput<H extends Hooks, C extends HostContext> = Plugin<H, C, any> | [Plugin<H, C, any>, unknown];

const toOrderNode = (plugin: Pick<Plugin, "name" | "pre" | "post" | "enforce">): OrderNode => ({
  name: plugin.name,
  pre: plugin.pre,
  post: plugin.post,
  enforce: plugin.enforce,
});

export class PluginManager<H extends Hooks, C extends HostContext = HostContext> {
  private readonly pg = new PluginGraph();
  private readonly registered = new Map<string, Entry<H, C>>();
  private readonly scopes = new Map<string, Scope>();
  private readonly exposed = new Map<string, unknown>();
  private readonly locks = new Map<string, Promise<unknown>>();

  public constructor(
    public readonly hooks: H,
    private readonly context: C,
  ) {
    // hook 内 tap 默认顺序 = 插件实时图序;增删插件后自动反映。
    for (const key of Object.keys(hooks) as Array<keyof H>) {
      (hooks[key] as Hook<any, any>).resolveWeight = (name) => this.pg.weightOf(name);
    }
  }

  /** 装配一批插件:入图 → 连依赖 → 环检测 → 按图序 setup。返回批量卸载(逆序)。 */
  public async use(list: Array<PluginInput<H, C>>): Promise<() => Promise<void>> {
    const items: Entry<H, C>[] = list.map((item) =>
      Array.isArray(item) ? { plugin: item[0], options: item[1] } : { plugin: item, options: undefined },
    );
    const fresh = items.filter(
      (item) => (!item.plugin.apply || item.plugin.apply(this.context)) && !this.registered.has(item.plugin.name),
    );

    const added: string[] = [];
    this.pg.batch(() => {
      for (const { plugin } of fresh) {
        this.pg.add(toOrderNode(plugin));
        added.push(plugin.name);
      }
      for (const { plugin } of fresh) this.pg.linkDeps(toOrderNode(plugin));
    });

    if (this.pg.hasCycle) {
      const error = this.pg.cycleError();
      for (const name of added) this.pg.remove(name); // 回滚,保持 use() 原子
      throw error;
    }

    const incoming = new Map(fresh.map((item) => [item.plugin.name, item]));
    const done: string[] = [];
    for (const nodeId of this.pg.topo.sorted()) {
      const entry = incoming.get(String(nodeId));
      if (!entry) continue;
      this.registered.set(entry.plugin.name, entry);
      await this.setupOne(entry);
      done.push(entry.plugin.name);
    }

    return async () => {
      for (const name of done.reverse()) await this.unload(name);
    };
  }

  /** 单插件热重载:同名加锁 → 关旧 scope → 重跑 setup(拓扑不变时图不动)。 */
  public reload(name: string): Promise<boolean> {
    return this.withLock(name, async () => {
      const entry = this.registered.get(name);
      if (!entry) return false;
      await this.closeScope(name);
      await this.setupOne(entry);
      return true;
    });
  }

  /** 卸载单个插件:关 scope + 从图摘除。 */
  public unload(name: string): Promise<void> {
    return this.withLock(name, async () => {
      await this.closeScope(name);
      this.registered.delete(name);
      this.pg.remove(name);
    });
  }

  /** 卸载全部并释放图订阅。 */
  public async dispose(): Promise<void> {
    for (const name of [...this.registered.keys()]) await this.unload(name);
    this.pg.dispose();
  }

  /** 当前已装配插件的顺序码快照。 */
  public codes(): ReturnType<PluginGraph["codes"]> {
    return this.pg.codes();
  }

  private async setupOne(entry: Entry<H, C>): Promise<void> {
    const scope: Scope = { untaps: [], disposers: [], exposedKeys: [], controller: new AbortController() };
    this.scopes.set(entry.plugin.name, scope);
    try {
      await entry.plugin.setup(this.makeApi(entry.plugin, entry.options, scope), entry.options);
    } catch (error) {
      this.context.logger?.error(`plugin "${entry.plugin.name}" setup failed: ${String(error)}`);
      await this.closeScope(entry.plugin.name); // 失败即回滚已注册的 tap / 资源
      throw error;
    }
  }

  private async closeScope(name: string): Promise<void> {
    const scope = this.scopes.get(name);
    if (!scope) return;
    scope.controller.abort();
    for (const off of scope.untaps) off();
    for (const dispose of [...scope.disposers].reverse()) {
      try {
        await dispose();
      } catch (error) {
        this.context.logger?.error(`dispose "${name}" failed: ${String(error)}`);
      }
    }
    for (const key of scope.exposedKeys) this.exposed.delete(key);
    this.scopes.delete(name);
  }

  private makeApi(plugin: Plugin<H, C, any>, options: unknown, scope: Scope): PluginContext<H, C> {
    const view: Record<string, { tap: (opts: unknown, fn: unknown) => () => void }> = {};
    for (const key of Object.keys(this.hooks) as Array<keyof H>) {
      const hook = this.hooks[key] as Hook<any, any>;
      view[key as string] = {
        tap: (opts: any, fn: any) => {
          const normalized = typeof opts === "string" ? { name: opts } : { ...opts };
          normalized.name ??= plugin.name;
          const off = hook.tap(normalized, fn);
          scope.untaps.push(off);
          return off;
        },
      };
    }
    return {
      name: plugin.name,
      options,
      context: this.context,
      hooks: view as unknown as Tappable<H>,
      signal: scope.controller.signal,
      onDispose: (fn) => {
        scope.disposers.push(fn);
      },
      expose: (key, value) => {
        this.exposed.set(key, value);
        scope.exposedKeys.push(key);
      },
      useExposed: <T = unknown,>(key: string): T | undefined => this.exposed.get(key) as T | undefined,
      hasPlugin: (name) => this.registered.has(name),
    };
  }

  private withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const next = (this.locks.get(key) ?? Promise.resolve()).then(work, work);
    this.locks.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }
}
