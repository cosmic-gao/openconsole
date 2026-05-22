/**
 * Test helpers — an in-memory Registry and a deterministic fetch mock.
 */
import type {
  Instance,
  RegisterOptions,
  Registry,
} from "../core/types";

export class FakeRegistry implements Registry {
  watchCalls = 0;
  watchShouldFail = false;
  unobserveCalls = 0;

  private services = new Map<string, Instance[]>();
  private configs = new Map<string, string>();
  private watchers = new Map<string, Set<(i: Instance[]) => void>>();
  private observers = new Map<string, Set<(c: string) => void>>();

  async ready() {}
  async close() {}

  /** Test setter: seed instances and notify subscribers. */
  setInstances(service: string, instances: Instance[], group = "DEFAULT_GROUP") {
    const key = `${group}::${service}`;
    this.services.set(key, instances);
    const subs = this.watchers.get(key);
    if (subs) for (const s of subs) s(instances);
  }

  /** Test setter: push a config update. */
  setConfig(dataId: string, content: string, group = "DEFAULT_GROUP") {
    const key = `${group}::${dataId}`;
    this.configs.set(key, content);
    const subs = this.observers.get(key);
    if (subs) for (const s of subs) s(content);
  }

  async register(_instance: Instance, _opts?: RegisterOptions) {}
  async deregister(_instance: Instance, _opts?: RegisterOptions) {}

  async list(service: string, group = "DEFAULT_GROUP") {
    return this.services.get(`${group}::${service}`) ?? [];
  }

  async watch(
    service: string,
    listener: (i: Instance[]) => void,
    group = "DEFAULT_GROUP",
  ) {
    this.watchCalls++;
    if (this.watchShouldFail) throw new Error("simulated watch failure");
    const key = `${group}::${service}`;
    const set = this.watchers.get(key) ?? new Set();
    set.add(listener);
    this.watchers.set(key, set);
  }

  async unwatch(
    service: string,
    listener: (i: Instance[]) => void,
    group = "DEFAULT_GROUP",
  ) {
    this.watchers.get(`${group}::${service}`)?.delete(listener);
  }

  async read(dataId: string, group = "DEFAULT_GROUP") {
    return this.configs.get(`${group}::${dataId}`) ?? null;
  }

  async observe(
    dataId: string,
    listener: (c: string) => void,
    group = "DEFAULT_GROUP",
  ) {
    const key = `${group}::${dataId}`;
    const set = this.observers.get(key) ?? new Set();
    set.add(listener);
    this.observers.set(key, set);
  }

  async unobserve(
    dataId: string,
    listener: (c: string) => void,
    group = "DEFAULT_GROUP",
  ) {
    this.unobserveCalls++;
    this.observers.get(`${group}::${dataId}`)?.delete(listener);
  }
}

export function instance(
  service: string,
  ip: string,
  port: number,
  extras: Partial<Instance> = {},
): Instance {
  return {
    service,
    ip,
    port,
    healthy: true,
    enabled: true,
    weight: 1,
    ...extras,
  };
}
