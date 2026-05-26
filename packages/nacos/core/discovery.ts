/**
 * 实例发现层 —— 由注册中心推送驱动的进程内缓存。
 *
 * 第一次 `list()` 同步拉取并建立长连接订阅，之后注册中心通过 push 更新
 * 本地缓存。订阅未建立时（首次拉取后到订阅成功之间，或者 watch 调用失败
 * 时）退化为按 TTL 重新拉取，避免反复请求注册中心。
 *
 * @module
 */
import { callable, resolve } from "./balancer";
import { markDynamic } from "./connection";
import {
  DEFAULT_GROUP,
  type Balancer,
  type Hint,
  type Instance,
  type Registry,
  type Strategy,
} from "./types";

/** 默认实例列表缓存 TTL（毫秒）。 */
const DEFAULT_TTL = 5_000;

/** 缓存项。 */
interface Entry {
  instances: Instance[];
  /** 本地拉取时间，用于 TTL 判定。 */
  fetchedAt: number;
  /** 是否已经成功订阅注册中心推送。 */
  subscribed: boolean;
}

/** {@link Discovery} 构造参数。 */
export interface DiscoveryOptions {
  registry: Registry;
  balancer?: Strategy;
  ttl?: number;
}

/**
 * 实例发现与缓存层。
 *
 * 由 {@link Http} 在解析 `nacos://` URL 时间接调用，业务方一般通过
 * `client.discover()` 获取单实例。
 */
export class Discovery {
  private readonly cache = new Map<string, Entry>();
  /**
   * 进行中的 fetch 集合(按 cacheKey 去重)。冷启动 / TTL 过期时若 N 个
   * 请求并发命中同一个服务,只允许 1 个真正打到注册中心,其它 N-1 个
   * 复用同一个 Promise。避免冷启动 thundering herd 把注册中心压垮。
   */
  private readonly inflight = new Map<string, Promise<Instance[]>>();
  private readonly registry: Registry;
  private readonly ttl: number;
  private readonly defaults: Balancer;

  constructor(opts: DiscoveryOptions) {
    this.registry = opts.registry;
    this.ttl = opts.ttl ?? DEFAULT_TTL;
    this.defaults = resolve(opts.balancer);
  }

  /**
   * 返回服务的健康可调用实例列表。
   *
   * 命中缓存(已订阅 或 TTL 未过期)直接返回;否则拉取并尝试订阅。并发
   * 调用同一 (service, group) 时只发起一次注册中心请求,见 {@link inflight}。
   */
  async list(service: string, group?: string): Promise<Instance[]> {
    // 标记当前 Server Component 路由为 dynamic —— 下面的 `Date.now()` /
    // `Math.random()`(默认负载均衡)需要这个 gate。直接调用 `discovery.list`
    // 或 `client.discover()` 的路径都走这里;走 `client.fetch()` 时
    // `Http.fetch` 已经标过一次,connection() 是幂等的,double-mark 无副作用。
    await markDynamic();

    const key = cacheKey(service, group);
    const now = Date.now();
    const hit = this.cache.get(key);

    if (hit && (hit.subscribed || now - hit.fetchedAt < this.ttl)) {
      return callable(hit.instances);
    }

    // 复用已在进行的 fetch(冷启动 thundering herd 防护)。
    const existing = this.inflight.get(key);
    if (existing) return existing.then(callable);

    const promise = this.fetchAndCache(service, group);
    this.inflight.set(key, promise);
    try {
      return callable(await promise);
    } finally {
      this.inflight.delete(key);
    }
  }

  /** 真正打注册中心 + 写缓存 + 起订阅。被 {@link list} 用 inflight Map 包住去重。 */
  private async fetchAndCache(service: string, group?: string): Promise<Instance[]> {
    const fresh = await this.registry.list(service, group);
    const key = cacheKey(service, group);
    this.cache.set(key, { instances: fresh, fetchedAt: Date.now(), subscribed: false });
    await this.subscribeOnce(service, group);
    return fresh;
  }

  /**
   * 取一个实例：按 `opts.balancer`（或构造时配置的默认策略）从健康列表里挑。
   */
  async pick(
    service: string,
    opts: { group?: string; balancer?: Balancer; hint?: Hint } = {},
  ): Promise<Instance | null> {
    const list = await this.list(service, opts.group);
    return (opts.balancer ?? this.defaults).pick(list, opts.hint);
  }

  /** 强制忽略 TTL，重新拉取一次实例列表。 */
  async refresh(service: string, group?: string) {
    const fresh = await this.registry.list(service, group);
    const key = cacheKey(service, group);
    this.cache.set(key, {
      instances: fresh,
      fetchedAt: Date.now(),
      subscribed: this.cache.get(key)?.subscribed ?? false,
    });
  }

  /**
   * 建立一次性订阅。失败时保留 `subscribed=false`，下次 `list()` 过 TTL
   * 后会自动重试 watch。
   */
  private async subscribeOnce(service: string, group?: string) {
    const key = cacheKey(service, group);
    const entry = this.cache.get(key);
    if (!entry || entry.subscribed) return;
    try {
      await this.registry.watch(
        service,
        (instances) => {
          this.cache.set(key, {
            instances,
            fetchedAt: Date.now(),
            subscribed: true,
          });
        },
        group,
      );
      entry.subscribed = true;
    } catch (err) {
      console.warn(
        `[nacos] watch failed for ${service}; falling back to TTL polling`,
        err,
      );
    }
  }
}

/** 缓存键：`${group}::${service}`。 */
function cacheKey(service: string, group?: string) {
  return `${group ?? DEFAULT_GROUP}::${service}`;
}
