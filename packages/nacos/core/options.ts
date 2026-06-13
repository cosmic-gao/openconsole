import { forward } from "./plugin";
import type {
  ConfigOptions,
  ConsumerOptions,
  Options,
  Plugin,
  ProviderOptions,
  RegistryOptions,
  Strategy,
} from "./types";

export const DEFAULT_SERVER = "127.0.0.1:8848";

export function loadEnvOptions(): Options {
  return {
    registry: loadRegistry(),
    provider: loadProvider(),
    consumer: loadConsumer(),
    config: loadConfig(),
    plugins: [forward()],
  };
}

function loadRegistry(): RegistryOptions {
  return {
    server: process.env.NACOS_SERVER ?? DEFAULT_SERVER,
    namespace: process.env.NACOS_NAMESPACE,
    username: process.env.NACOS_USERNAME,
    password: process.env.NACOS_PASSWORD,
    timeout: parseNumber(process.env.NACOS_CONFIG_TIMEOUT),
  };
}

function loadProvider(): ProviderOptions | undefined {
  if (parseBoolean(process.env.NACOS_PROVIDER_ENABLED) !== true) return undefined;
  const service = process.env.NACOS_PROVIDER_SERVICE;
  const port = parseNumber(process.env.NACOS_PROVIDER_PORT ?? process.env.PORT);
  if (!service || port === undefined) return undefined;
  return {
    enabled: true,
    service,
    port,
    group: process.env.NACOS_PROVIDER_GROUP,
    weight: parseNumber(process.env.NACOS_PROVIDER_WEIGHT),
    cluster: process.env.NACOS_PROVIDER_CLUSTER,
    ephemeral: parseBoolean(process.env.NACOS_PROVIDER_EPHEMERAL),
  };
}

function loadConsumer(): ConsumerOptions {
  const opts: ConsumerOptions = {};
  const balancer = parseBalancer(process.env.NACOS_BALANCER);
  if (balancer) opts.balancer = balancer;
  const timeout = parseNumber(process.env.NACOS_REQUEST_TIMEOUT);
  if (timeout !== undefined) opts.timeout = timeout;
  const attempts = parseNumber(process.env.NACOS_RETRY_ATTEMPTS);
  if (attempts !== undefined) opts.retry = { attempts };
  const ttl = parseNumber(process.env.NACOS_DISCOVERY_TTL);
  if (ttl !== undefined) opts.ttl = ttl;
  return opts;
}

function loadConfig(): ConfigOptions | undefined {
  const sourcesRaw = process.env.NACOS_CONFIG_SOURCES;
  const tag = process.env.NACOS_CONFIG_TAG;
  if (!sourcesRaw && !tag) return undefined;
  const opts: ConfigOptions = {};
  if (sourcesRaw) opts.sources = parseSources(sourcesRaw);
  if (tag) opts.tag = tag;
  return opts;
}

export interface OptionsOverride {
  registry?: Partial<RegistryOptions>;
  provider?: Partial<ProviderOptions>;
  consumer?: Partial<ConsumerOptions>;
  config?: Partial<ConfigOptions>;
  plugins?: Plugin[];
}

export function mergeOptions(base: Options, override: OptionsOverride): Options {
  return {
    registry: { ...base.registry, ...override.registry } as RegistryOptions,
    provider: mergeProvider(base.provider, override.provider),
    consumer: { ...base.consumer, ...override.consumer },
    config: mergeConfig(base.config, override.config),
    plugins: override.plugins ?? base.plugins,
  };
}

export function resolveOptions(override: OptionsOverride = {}): Options {
  return mergeOptions(loadEnvOptions(), override);
}

function mergeProvider(
  base: ProviderOptions | undefined,
  override: Partial<ProviderOptions> | undefined,
): ProviderOptions | undefined {
  if (!base && !override) return undefined;
  const merged = { ...(base ?? {}), ...(override ?? {}) } as Partial<ProviderOptions>;
  if (merged.enabled !== true || !merged.service || merged.port === undefined) {
    return undefined;
  }
  return merged as ProviderOptions;
}

function mergeConfig(
  base: ConfigOptions | undefined,
  override: Partial<ConfigOptions> | undefined,
): ConfigOptions | undefined {
  if (!base && !override) return undefined;
  return { ...(base ?? {}), ...(override ?? {}) };
}

function parseBoolean(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const l = v.trim().toLowerCase();
  if (l === "1" || l === "true" || l === "yes" || l === "on") return true;
  if (l === "0" || l === "false" || l === "no" || l === "off") return false;
  return undefined;
}

function parseNumber(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseBalancer(v: string | undefined): Strategy | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase();
  if (s === "weighted" || s === "round-robin" || s === "random" || s === "sticky") return s;
  return undefined;
}

function parseSources(
  raw: string,
): Array<{ dataId: string; group?: string; key?: string }> {
  const result: Array<{ dataId: string; group?: string; key?: string }> = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    let rest = trimmed;
    let key: string | undefined;
    let group: string | undefined;
    const colon = rest.indexOf(":");
    if (colon >= 0) {
      key = rest.slice(colon + 1).trim() || undefined;
      rest = rest.slice(0, colon);
    }
    const at = rest.indexOf("@");
    if (at >= 0) {
      group = rest.slice(at + 1).trim() || undefined;
      rest = rest.slice(0, at);
    }
    const dataId = rest.trim();
    if (!dataId) continue;
    result.push({ dataId, group, key });
  }
  return result;
}
