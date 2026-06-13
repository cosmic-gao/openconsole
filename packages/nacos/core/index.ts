import { Config } from "./config";
import { Discovery } from "./discovery";
import { Http, NoInstanceError } from "./http";
import { Plugins } from "./plugin";
import { Provider } from "./provider";
import { NacosRegistry } from "./registry";
import { NO_OP_RUNTIME, type Runtime } from "./runtime";
import { buildService, type Service } from "./service";
import type { FetchOptions, Hint, Instance, Options, Plugin, Registry } from "./types";

export type {
  Balancer,
  ConfigOptions,
  ConsumerOptions,
  Context,
  ErrorStep,
  FetchOptions,
  Hint,
  Instance,
  Options,
  Plugin,
  ProviderOptions,
  RegisterOptions,
  Registry,
  RegistryOptions,
  RequestStep,
  ResponseStep,
  Retry,
  RetryInput,
  Strategy,
} from "./types";

export { Config, Discovery, Http, NacosRegistry, NoInstanceError, NO_OP_RUNTIME, Plugins, Provider };
export type { Runtime, Service };
export { TimeoutError } from "./http";
export { HttpError } from "./service";
export { roundRobin, random, weighted, sticky, resolve as strategy } from "./balancer";
export { logger, headers, forward, context, type ForwardOptions } from "./plugin";
export {
  loadEnvOptions,
  mergeOptions,
  resolveOptions,
  DEFAULT_SERVER,
  type OptionsOverride,
} from "./options";
export { withRequestHeaders, currentRequestHeaders } from "./scope";

export interface Client {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly registry: Registry;
  readonly discovery: Discovery;
  readonly http: Http;
  readonly provider: Provider | null;
  readonly config: ConfigApi;
  readonly plugins: Plugins;
  readonly runtime: Runtime;
  fetch(input: string | URL | Request, init?: FetchOptions): Promise<Response>;
  discover(service: string, hint?: Hint): Promise<Instance>;
  service(name: string): Service;
  use(plugin: Plugin): void;
}

export interface ConfigApi {
  get<T>(key: string, fallback: T): T;
  get<T>(key: string): T | undefined;
  get(): Record<string, unknown>;
  on(listener: (key: string, value: unknown) => void): () => void;
  revalidate(): Promise<void>;
}

export function create(options: Options): Client {
  const runtime = options.runtime ?? NO_OP_RUNTIME;
  const registry: Registry = new NacosRegistry(options.registry);
  const plugins = new Plugins(options.plugins ?? []);
  const discovery = new Discovery({
    registry,
    balancer: options.consumer?.balancer,
    ttl: options.consumer?.ttl,
    runtime,
  });
  const http = new Http({
    discovery,
    plugins,
    timeout: options.consumer?.timeout,
    retry: options.consumer?.retry,
    runtime,
  });
  const provider = options.provider?.enabled
    ? new Provider(registry, options.provider)
    : null;
  // Config 结构上满足 ConfigApi(get / on / revalidate),直接作为 client.config 暴露。
  const config = new Config({ registry, options: options.config ?? {}, runtime });

  let running = false;

  return {
    registry,
    discovery,
    http,
    provider,
    config,
    plugins,
    runtime,

    async start() {
      if (running) return;
      running = true;
      await registry.ready();
      await config.start();
      if (provider) await provider.start();
    },

    async stop() {
      if (!running) return;
      running = false;
      if (provider) await provider.stop();
      await config.stop();
      await registry.close();
    },

    fetch: (input, init) => http.fetch(input, init),

    async discover(service, hint) {
      const picked = await discovery.pick(service, { hint });
      if (!picked) throw new NoInstanceError(service);
      return picked;
    },

    service(name) {
      return buildService(name, http);
    },

    use(plugin) {
      plugins.use(plugin);
    },
  };
}
