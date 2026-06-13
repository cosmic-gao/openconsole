import { callable, resolve } from "./balancer";
import { NO_OP_RUNTIME, type Runtime } from "./runtime";
import {
  DEFAULT_GROUP,
  type Balancer,
  type Hint,
  type Instance,
  type Registry,
  type Strategy,
} from "./types";

const DEFAULT_TTL = 5_000;

interface Entry {
  instances: Instance[];
  fetchedAt: number;
  subscribed: boolean;
}

export interface DiscoveryOptions {
  registry: Registry;
  balancer?: Strategy;
  ttl?: number;
  runtime?: Runtime;
}

export class Discovery {
  private readonly cache = new Map<string, Entry>();
  // 冷启动 / TTL 过期时,N 个并发请求命中同一服务只放 1 个真正打注册中心,其余复用同一 Promise,防 thundering herd。
  private readonly inflight = new Map<string, Promise<Instance[]>>();
  private readonly registry: Registry;
  private readonly ttl: number;
  private readonly defaults: Balancer;
  private readonly runtime: Runtime;

  constructor(opts: DiscoveryOptions) {
    this.registry = opts.registry;
    this.ttl = opts.ttl ?? DEFAULT_TTL;
    this.defaults = resolve(opts.balancer);
    this.runtime = opts.runtime ?? NO_OP_RUNTIME;
  }

  async list(service: string, group?: string): Promise<Instance[]> {
    await this.runtime.markDynamic(); // 标记 dynamic(Next 16);幂等,Http.fetch 可能已标过一次。

    const key = cacheKey(service, group);
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && (hit.subscribed || now - hit.fetchedAt < this.ttl)) {
      return callable(hit.instances);
    }

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

  private async fetchAndCache(service: string, group?: string): Promise<Instance[]> {
    const fresh = await this.registry.list(service, group);
    const key = cacheKey(service, group);
    this.cache.set(key, { instances: fresh, fetchedAt: Date.now(), subscribed: false });
    await this.subscribeOnce(service, group);
    return fresh;
  }

  async pick(
    service: string,
    opts: { group?: string; balancer?: Balancer; hint?: Hint } = {},
  ): Promise<Instance | null> {
    const list = await this.list(service, opts.group);
    return (opts.balancer ?? this.defaults).pick(list, opts.hint);
  }

  async refresh(service: string, group?: string) {
    const fresh = await this.registry.list(service, group);
    const key = cacheKey(service, group);
    this.cache.set(key, {
      instances: fresh,
      fetchedAt: Date.now(),
      subscribed: this.cache.get(key)?.subscribed ?? false,
    });
  }

  // 失败时保留 subscribed=false,下次 list() 过 TTL 后重试 watch。
  private async subscribeOnce(service: string, group?: string) {
    const key = cacheKey(service, group);
    const entry = this.cache.get(key);
    if (!entry || entry.subscribed) return;
    try {
      await this.registry.watch(
        service,
        (instances) => {
          this.cache.set(key, { instances, fetchedAt: Date.now(), subscribed: true });
        },
        group,
      );
      entry.subscribed = true;
    } catch (err) {
      console.warn(`[nacos] watch failed for ${service}; falling back to TTL polling`, err);
    }
  }
}

function cacheKey(service: string, group?: string) {
  return `${group ?? DEFAULT_GROUP}::${service}`;
}
