/**
 * 基于官方 `nacos` SDK 的 {@link Registry} 实现。
 *
 * 仅承担两件事：
 *
 * 1. 在 SDK 的 host 形态与本包的 {@link Instance} 之间互转；
 * 2. 隐藏「NamingClient + ConfigClient」两个客户端的协同。
 *
 * 缓存、负载均衡、重试、插件等高阶能力都在上层模块里。
 *
 * @module
 */
import { DEFAULT_GROUP, type Instance, type RegisterOptions, type Registry, type RegistryOptions } from "./types";

/** Nacos SDK 内部的 host 形态。 */
interface SdkHost {
  instanceId: string;
  ip: string;
  port: number;
  healthy: boolean;
  enabled: boolean;
  weight?: number;
  clusterName?: string;
  metadata?: Record<string, string>;
}

/** `nacos` SDK 的 NamingClient 接口子集（只声明本模块用到的）。 */
interface NamingSdk {
  ready(): Promise<void>;
  close?(): Promise<void>;
  registerInstance(
    serviceName: string,
    host: Record<string, unknown>,
    groupName?: string,
  ): Promise<void>;
  deregisterInstance(
    serviceName: string,
    host: Record<string, unknown>,
    groupName?: string,
  ): Promise<void>;
  getAllInstances(serviceName: string, groupName?: string): Promise<SdkHost[]>;
  subscribe(
    opts: { serviceName: string; groupName?: string },
    listener: (hosts: SdkHost[]) => void,
  ): void;
  unSubscribe(
    opts: { serviceName: string; groupName?: string },
    listener: (hosts: SdkHost[]) => void,
  ): void;
}

/** `nacos` SDK 的 ConfigClient 接口子集。 */
interface ConfigSdk {
  close?(): Promise<void>;
  getConfig(dataId: string, group: string): Promise<string | null>;
  subscribe(
    opts: { dataId: string; group: string },
    listener: (content: string) => void,
  ): void;
  unSubscribe?(
    opts: { dataId: string; group: string },
    listener?: (content: string) => void,
  ): void;
}

/** Nacos 默认命名空间 id。 */
const DEFAULT_NAMESPACE = "public";

/** SDK host → 本包 {@link Instance}。 */
function toInstance(service: string, host: SdkHost): Instance {
  return {
    id: host.instanceId,
    service,
    ip: host.ip,
    port: host.port,
    healthy: host.healthy,
    enabled: host.enabled,
    weight: host.weight,
    cluster: host.clusterName,
    metadata: host.metadata,
  };
}

/** 本包 {@link Instance} → SDK host。 */
function toSdk(instance: Instance) {
  return {
    ip: instance.ip,
    port: instance.port,
    weight: instance.weight ?? 1,
    healthy: instance.healthy,
    enabled: instance.enabled,
    instanceId:
      instance.id ??
      `${instance.ip}#${instance.port}#DEFAULT#${instance.service}`,
    clusterName: instance.cluster,
    ephemeral: true,
    metadata: instance.metadata ?? {},
  };
}

type InstanceListener = (instances: Instance[]) => void;
type ContentListener = (content: string) => void;

/**
 * Nacos 注册中心适配器。
 *
 * 业务方一般不直接用本类，而是通过 {@link Client.registry}（仍然类型化为
 * {@link Registry} 接口）访问，以便后续替换实现。
 */
export class NacosRegistry implements Registry {
  private naming: NamingSdk | null = null;
  private config: ConfigSdk | null = null;
  private readyPromise: Promise<void> | null = null;
  /**
   * 订阅 wrapper 表，按 `${group}|${service}` 分桶，桶内用 WeakMap 把用户
   * listener 映射到 SDK 真正订阅的 wrap 函数。分桶是为了让同一个 listener
   * 可以同时订阅多个服务，互不覆盖（否则 unwatch 取到错的 wrap，第一个
   * 订阅会永久泄漏）。
   */
  private readonly watchWrappers = new Map<
    string,
    WeakMap<InstanceListener, (hosts: SdkHost[]) => void>
  >();
  /** 同 {@link watchWrappers}，针对 ConfigClient。 */
  private readonly observeWrappers = new Map<
    string,
    WeakMap<ContentListener, (content: string) => void>
  >();

  constructor(private readonly opts: RegistryOptions) {}

  /** 等待 NamingClient + ConfigClient 初始化完成。并发调用去重。 */
  ready(): Promise<void> {
    if (this.naming && this.config) return Promise.resolve();
    return (this.readyPromise ??= this.initialize());
  }

  /**
   * 实际创建 SDK 客户端。
   *
   * 动态 import `nacos` 是为了延迟加载（启动期 hot path 可以更轻），
   * 同时让本包在没有 peer 依赖的环境（测试桩、纯客户端打包）也能
   * 完成 type-check。
   */
  private async initialize(): Promise<void> {
    const sdk = (await import("nacos")) as unknown as {
      NacosNamingClient: new (o: Record<string, unknown>) => NamingSdk;
      NacosConfigClient: new (o: Record<string, unknown>) => ConfigSdk;
    };

    const naming = new sdk.NacosNamingClient({
      logger: console,
      serverList: this.opts.server,
      namespace: this.opts.namespace ?? DEFAULT_NAMESPACE,
      username: this.opts.username,
      password: this.opts.password,
    });
    await naming.ready();

    const config = new sdk.NacosConfigClient({
      serverAddr: this.opts.server,
      namespace: this.opts.namespace ?? DEFAULT_NAMESPACE,
      username: this.opts.username,
      password: this.opts.password,
      requestTimeout: this.opts.timeout ?? 6000,
    });

    this.naming = naming;
    this.config = config;
  }

  /** 关闭 SDK 客户端，吞掉非致命错误。 */
  async close(): Promise<void> {
    try {
      await this.naming?.close?.();
    } catch (err) {
      console.warn("[nacos] naming client close failed", err);
    }
    try {
      await this.config?.close?.();
    } catch (err) {
      console.warn("[nacos] config client close failed", err);
    }
    this.naming = null;
    this.config = null;
    this.readyPromise = null;
  }

  async register(instance: Instance, opts: RegisterOptions = {}) {
    await this.ready();
    await this.naming!.registerInstance(
      instance.service,
      toSdk(instance),
      opts.group ?? DEFAULT_GROUP,
    );
  }

  async deregister(instance: Instance, opts: RegisterOptions = {}) {
    await this.ready();
    await this.naming!.deregisterInstance(
      instance.service,
      toSdk(instance),
      opts.group ?? DEFAULT_GROUP,
    );
  }

  async list(service: string, group = DEFAULT_GROUP): Promise<Instance[]> {
    await this.ready();
    const hosts: SdkHost[] = await this.naming!.getAllInstances(service, group);
    return hosts.map((h) => toInstance(service, h));
  }

  async watch(
    service: string,
    listener: InstanceListener,
    group = DEFAULT_GROUP,
  ) {
    await this.ready();
    const wrap = (hosts: SdkHost[]) =>
      listener(hosts.map((h) => toInstance(service, h)));
    const slot = bucket(this.watchWrappers, group, service);
    slot.set(listener, wrap);
    this.naming!.subscribe({ serviceName: service, groupName: group }, wrap);
  }

  async unwatch(
    service: string,
    listener: InstanceListener,
    group = DEFAULT_GROUP,
  ) {
    await this.ready();
    const slot = this.watchWrappers.get(scope(group, service));
    const wrap = slot?.get(listener);
    if (!slot || !wrap) return;
    this.naming!.unSubscribe({ serviceName: service, groupName: group }, wrap);
    slot.delete(listener);
  }

  async read(dataId: string, group = DEFAULT_GROUP): Promise<string | null> {
    await this.ready();
    const raw = await this.config!.getConfig(dataId, group);
    return raw ?? null;
  }

  async observe(
    dataId: string,
    listener: ContentListener,
    group = DEFAULT_GROUP,
  ) {
    await this.ready();
    const wrap = (content: string) => listener(content);
    const slot = bucket(this.observeWrappers, group, dataId);
    slot.set(listener, wrap);
    this.config!.subscribe({ dataId, group }, wrap);
  }

  async unobserve(
    dataId: string,
    listener: ContentListener,
    group = DEFAULT_GROUP,
  ) {
    await this.ready();
    const slot = this.observeWrappers.get(scope(group, dataId));
    const wrap = slot?.get(listener);
    if (!slot || !wrap) return;
    this.config!.unSubscribe?.({ dataId, group }, wrap);
    slot.delete(listener);
  }
}

/** 拼装订阅桶的字符串键。 */
function scope(group: string, name: string): string {
  return `${group}|${name}`;
}

/** 按需获取/创建一个 wrapper 桶。 */
function bucket<L extends object, W>(
  store: Map<string, WeakMap<L, W>>,
  group: string,
  name: string,
): WeakMap<L, W> {
  const key = scope(group, name);
  let slot = store.get(key);
  if (!slot) {
    slot = new WeakMap();
    store.set(key, slot);
  }
  return slot;
}
