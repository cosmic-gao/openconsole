/**
 * 动态配置 —— 由注册中心长轮询喂养的内存快照。
 *
 * 每个被订阅的 dataId 会变成 snapshot 中的一个顶层键（按 `key` 或 `dataId`
 * 命名）。读操作是同步的；收到推送时本模块会：
 *
 * 1. 更新 snapshot；
 * 2. 通知进程内 `on()` 监听器；
 * 3. （如运行在 Next.js 下）触发 `revalidateTag`，让对应 cache tag 的 RSC
 *    分段在下次请求时重新渲染。
 *
 * `stop()` 是幂等的，会取消所有订阅 —— 必须在 Registry 关闭之前调用
 * （或在测试 / HMR 主动 teardown 时）。
 *
 * @module
 */
import type { ConfigOptions, Registry } from "./types";

/** {@link Config} 构造依赖。 */
export interface ConfigDeps {
  registry: Registry;
  options: ConfigOptions;
}

/** 内部订阅记录，便于 `stop()` 时精准 unobserve。 */
interface Subscription {
  dataId: string;
  group?: string;
  listener: (content: string) => void;
}

/**
 * 动态配置管理器。
 *
 * 通过 {@link Client.config} 暴露给业务，不直接实例化。
 */
export class Config {
  private readonly snapshot: Record<string, unknown> = {};
  private readonly listeners = new Set<(key: string, value: unknown) => void>();
  private readonly subscriptions: Subscription[] = [];
  private readonly registry: Registry;
  private readonly options: ConfigOptions;
  private started = false;

  constructor(deps: ConfigDeps) {
    this.registry = deps.registry;
    this.options = deps.options;
  }

  /**
   * 拉取并订阅所有配置 source。可重入。
   *
   * 多个 source 并发拉取，启动耗时取决于最慢的那一条而不是累加。
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await Promise.all(
      (this.options.sources ?? []).map(async (src) => {
        const key = src.key ?? src.dataId;
        const raw = await this.registry.read(src.dataId, src.group);
        this.snapshot[key] = parse(raw, src.dataId);
        const listener = async (content: string) => {
          this.snapshot[key] = parse(content, src.dataId);
          this.fire(key);
          await this.revalidate();
        };
        this.subscriptions.push({
          dataId: src.dataId,
          group: src.group,
          listener,
        });
        await this.registry.observe(src.dataId, listener, src.group);
      }),
    );
  }

  /** 取消所有订阅并清空进程内监听器。可重入。 */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    const subs = this.subscriptions.splice(0);
    for (const s of subs) {
      try {
        await this.registry.unobserve(s.dataId, s.listener, s.group);
      } catch (err) {
        console.warn("[nacos] config unobserve failed", err);
      }
    }
    this.listeners.clear();
  }

  /**
   * 读取配置。
   *
   * @example
   * ```ts
   * cfg.get<Flags>("flags", {} as Flags); // 带默认值
   * cfg.get<Throttle>("throttle");        // 可能 undefined
   * cfg.get();                            // 全量 snapshot
   * ```
   */
  get<T>(key: string, fallback: T): T;
  get<T>(key: string): T | undefined;
  get(): Record<string, unknown>;
  get<T>(
    key?: string,
    fallback?: T,
  ): T | undefined | Record<string, unknown> {
    if (key === undefined) return this.snapshot;
    const value = this.snapshot[key];
    return (value === undefined ? fallback : value) as T | undefined;
  }

  /**
   * 订阅配置变更，返回取消订阅的函数。
   *
   * 注意 listener 是**同步**触发的（与 snapshot 更新同一 tick）。
   * 后续的 `revalidate()` 是异步进行的，不影响 listener。
   */
  on(listener: (key: string, value: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 主动触发 Next.js 的 `revalidateTag(tag)`，让对应 cache tag 的 RSC
   * 分段在下次请求时重新渲染。
   *
   * 未在 Next.js 环境（动态 import 失败）或未配置 `tag` 时为空操作。
   */
  async revalidate(): Promise<void> {
    const tag = this.options.tag;
    if (!tag) return;
    try {
      const mod = (await import("next/cache").catch(() => null)) as
        | { revalidateTag?: unknown }
        | null;
      const fn = mod?.revalidateTag;
      if (typeof fn !== "function") return;
      // `{ expire: 0 }` 在 Next 15 上会被忽略，在 Next 16 上表示「立刻失效」，
      // 同样的调用形态在两个版本上行为一致。
      (fn as (...args: unknown[]) => void)(tag, { expire: 0 });
    } catch {
      /* 未在 Next.js 中运行，忽略 */
    }
  }

  /** 通知所有进程内监听器；单个 listener 抛错不会影响其他 listener。 */
  private fire(key: string) {
    const value = this.snapshot[key];
    for (const l of this.listeners) {
      try {
        l(key, value);
      } catch (err) {
        console.error("[nacos] config listener threw", err);
      }
    }
  }
}

/**
 * 把 Nacos 拉到的原始内容解析为 JS 对象。
 *
 * 非 JSON（YAML / properties / 纯文本）原样保留为字符串并打印一条 warning，
 * 调用方可在 `on()` 回调中自行 post-process。
 */
function parse(raw: string | null | undefined, dataId: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(
      `[nacos] config '${dataId}' is not JSON; exposing raw string`,
    );
    return raw;
  }
}
