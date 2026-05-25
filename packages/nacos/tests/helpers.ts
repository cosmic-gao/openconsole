/**
 * 测试帮助文件 —— 内存 Registry 与 Instance 工厂。
 *
 * 用 {@link FakeRegistry} 取代真正的 Nacos 服务，免去网络与 SDK 依赖。
 *
 * @module
 */
import type {
  Instance,
  RegisterOptions,
  Registry,
} from "../core/types";

/**
 * 内存版 {@link Registry}：保留实例 / 配置的当前快照，并维护订阅者集合。
 *
 * 暴露 `setInstances` / `setConfig` 给测试用例主动推送，模拟注册中心
 * 的 watch / observe 回调。
 */
export class FakeRegistry implements Registry {
  /** `watch()` 调用次数，方便断言重订阅行为。 */
  watchCalls = 0;
  /** 设为 true 时让 `watch()` 抛错，模拟订阅失败。 */
  watchShouldFail = false;
  /** `unobserve()` 调用次数，方便断言 Config.stop() 清理订阅。 */
  unobserveCalls = 0;

  private services = new Map<string, Instance[]>();
  private configs = new Map<string, string>();
  private watchers = new Map<string, Set<(i: Instance[]) => void>>();
  private observers = new Map<string, Set<(c: string) => void>>();

  async ready() {}
  async close() {}

  /** 测试 setter：写入实例列表并通知订阅者。 */
  setInstances(service: string, instances: Instance[], group = "DEFAULT_GROUP") {
    const key = `${group}::${service}`;
    this.services.set(key, instances);
    const subs = this.watchers.get(key);
    if (subs) for (const s of subs) s(instances);
  }

  /** 测试 setter：写入配置并通知订阅者。 */
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

/** 快速构造测试用 {@link Instance}，缺省字段填充健康可调用。 */
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
