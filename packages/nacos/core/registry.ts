/**
 * NacosRegistry — concrete Registry backed by `nacos` SDK.
 *
 * Two responsibilities:
 *   - Translate between SDK shapes and the package's `Instance` type.
 *   - Hide the dual-client setup (NamingClient + ConfigClient).
 *
 * Everything richer (caching, LB, retry, plugins) lives one layer up.
 */
import type {
  Instance,
  RegisterOptions,
  Registry,
  RegistryOptions,
} from "./types";

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

const DEFAULT_GROUP = "DEFAULT_GROUP";
const DEFAULT_NAMESPACE = "public";

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

export class NacosRegistry implements Registry {
  private naming: NamingSdk | null = null;
  private config: ConfigSdk | null = null;
  private readyPromise: Promise<void> | null = null;
  private readonly watchWrappers = new WeakMap<
    object,
    (hosts: SdkHost[]) => void
  >();
  private readonly observeWrappers = new WeakMap<
    object,
    (content: string) => void
  >();

  constructor(private readonly opts: RegistryOptions) {}

  ready(): Promise<void> {
    if (this.naming && this.config) return Promise.resolve();
    return (this.readyPromise ??= this.initialize());
  }

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
    listener: (instances: Instance[]) => void,
    group = DEFAULT_GROUP,
  ) {
    await this.ready();
    const wrap = (hosts: SdkHost[]) =>
      listener(hosts.map((h) => toInstance(service, h)));
    this.watchWrappers.set(listener, wrap);
    this.naming!.subscribe({ serviceName: service, groupName: group }, wrap);
  }

  async unwatch(
    service: string,
    listener: (instances: Instance[]) => void,
    group = DEFAULT_GROUP,
  ) {
    await this.ready();
    const wrap = this.watchWrappers.get(listener);
    if (!wrap) return;
    this.naming!.unSubscribe({ serviceName: service, groupName: group }, wrap);
    this.watchWrappers.delete(listener);
  }

  async read(dataId: string, group = DEFAULT_GROUP): Promise<string | null> {
    await this.ready();
    const raw = await this.config!.getConfig(dataId, group);
    return raw ?? null;
  }

  async observe(
    dataId: string,
    listener: (content: string) => void,
    group = DEFAULT_GROUP,
  ) {
    await this.ready();
    const wrap = (content: string) => listener(content);
    this.observeWrappers.set(listener, wrap);
    this.config!.subscribe({ dataId, group }, wrap);
  }

  async unobserve(
    dataId: string,
    listener: (content: string) => void,
    group = DEFAULT_GROUP,
  ) {
    await this.ready();
    const wrap = this.observeWrappers.get(listener);
    if (!wrap) return;
    this.config!.unSubscribe?.({ dataId, group }, wrap);
    this.observeWrappers.delete(listener);
  }
}
