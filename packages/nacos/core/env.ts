/**
 * 从 `process.env` 读取默认配置。
 *
 * {@link init} 会先调用 {@link loadEnvOptions} 拿到一份完整 {@link Options}
 * 作为基线，再用调用方传入的 override 浅合并。运行时无任何配置时也能直接
 * 跑起来（连接 `127.0.0.1:8848`），写到 README 里的所有 `NACOS_*` 变量
 * 都会被识别。
 *
 * @module
 */
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

/** `NACOS_SERVER` 未设置时使用的默认地址。 */
export const DEFAULT_SERVER = "127.0.0.1:8848";

/**
 * 从 `process.env` 加载完整的默认 {@link Options}。
 *
 * - `registry.server` 缺省 {@link DEFAULT_SERVER}，便于本地零配置启动；
 * - `provider` 仅在显式 `NACOS_PROVIDER_ENABLED=true` 且能拿到 service+port
 *   时返回，否则为 undefined；
 * - `consumer` / `config` 字段按需填入，空字段保留默认行为；
 * - `plugins` 默认包含 {@link forward}，让上游请求头自动透传。
 */
export function loadEnvOptions(): Options {
  return {
    registry: loadRegistry(),
    provider: loadProvider(),
    consumer: loadConsumer(),
    config: loadConfig(),
    plugins: loadPlugins(),
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
  // 没有 PORT 时退回 Next.js 标准的 PORT 环境变量。
  const port = parseNumber(
    process.env.NACOS_PROVIDER_PORT ?? process.env.PORT,
  );
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

function loadPlugins(): Plugin[] {
  // 默认带上 forward()：99% 的 Next.js 业务场景都需要把上游请求头透传给
  // 下游服务；不需要时通过 init({ plugins: [...] }) 显式覆盖。
  return [forward()];
}

/**
 * 解析常见的布尔值字面量。
 *
 * - `"1"` / `"true"` / `"yes"` / `"on"`  → true
 * - `"0"` / `"false"` / `"no"` / `"off"` → false
 * - 其它 → undefined（让上层走默认值）
 */
function parseBoolean(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const l = v.trim().toLowerCase();
  if (l === "1" || l === "true" || l === "yes" || l === "on") return true;
  if (l === "0" || l === "false" || l === "no" || l === "off") return false;
  return undefined;
}

/** 解析非负数字；非法值返回 undefined。 */
function parseNumber(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 解析负载均衡策略名；不在白名单内返回 undefined。 */
function parseBalancer(v: string | undefined): Strategy | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase();
  if (s === "weighted" || s === "round-robin" || s === "random" || s === "sticky") {
    return s;
  }
  return undefined;
}

/**
 * 解析 `NACOS_CONFIG_SOURCES`，语法：
 *
 *     dataId[@group][:key]
 *
 * 多条用逗号分隔。例如：
 *
 *     app.json,flags.json:flags,throttle.yaml@throttles:throttle
 *
 * 解析为：
 *
 *     [
 *       { dataId: "app.json" },
 *       { dataId: "flags.json", key: "flags" },
 *       { dataId: "throttle.yaml", group: "throttles", key: "throttle" },
 *     ]
 */
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
