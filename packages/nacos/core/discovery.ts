/**
 * Discovery — in-process instance cache fed by Registry pushes.
 *
 * First lookup pulls + subscribes (registry pushes keep the cache fresh).
 * Lookups outside any subscription respect a short TTL to dampen load.
 */
import { callable, resolve } from "./balancer";
import type {
  Balancer,
  Hint,
  Instance,
  Registry,
  Strategy,
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
}

export class Discovery {
  private readonly cache = new Map<string, Entry>();
  private readonly registry: Registry;
  private readonly ttl: number;
  private readonly defaults: Balancer;

  constructor(opts: DiscoveryOptions) {
    this.registry = opts.registry;
    this.ttl = opts.ttl ?? DEFAULT_TTL;
    this.defaults = resolve(opts.balancer);
  }

  /** Healthy+enabled instances. Cache-first; subscribes on miss. */
  async list(service: string, group?: string): Promise<Instance[]> {
    const key = cacheKey(service, group);
    const now = Date.now();
    const hit = this.cache.get(key);

    if (hit && (hit.subscribed || now - hit.fetchedAt < this.ttl)) {
      return callable(hit.instances);
    }

    const fresh = await this.registry.list(service, group);
    this.cache.set(key, { instances: fresh, fetchedAt: now, subscribed: false });
    await this.subscribeOnce(service, group);
    return callable(fresh);
  }

  /** Pick one using default or per-call balancer. */
  async pick(
    service: string,
    opts: { group?: string; balancer?: Balancer; hint?: Hint } = {},
  ): Promise<Instance | null> {
    const list = await this.list(service, opts.group);
    return (opts.balancer ?? this.defaults).pick(list, opts.hint);
  }

  /** Force a refresh past TTL. */
  async refresh(service: string, group?: string) {
    const fresh = await this.registry.list(service, group);
    const key = cacheKey(service, group);
    this.cache.set(key, {
      instances: fresh,
      fetchedAt: Date.now(),
      subscribed: this.cache.get(key)?.subscribed ?? false,
    });
  }

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
      // Leave `subscribed=false` so the next list() past TTL retries the watch.
      console.warn(
        `[nacos] watch failed for ${service}; falling back to TTL polling`,
        err,
      );
    }
  }
}

function cacheKey(service: string, group?: string) {
  return `${group ?? "DEFAULT_GROUP"}::${service}`;
}
