/**
 * `@openconsole/nacos` 主入口 —— Next.js 16 专用 Nacos 客户端。
 *
 * 在 `instrumentation.ts` 中接入：
 *
 * @example
 * ```ts
 * import { init, logger, forward } from "@openconsole/nacos";
 *
 * export async function register() {
 *   if (process.env.NEXT_RUNTIME !== "nodejs") return;
 *   await init(() => ({
 *     registry: { server: "127.0.0.1:8848" },
 *     provider: { enabled: true, service: "nextjs-admin", port: 3000 },
 *     consumer: { balancer: "weighted", retry: { attempts: 3 } },
 *     config: { sources: [{ dataId: "app.json" }], tag: "app-config" },
 *     plugins: [logger(), forward()],
 *   }));
 * }
 * ```
 *
 * 业务代码中：
 *
 * @example
 * ```ts
 * import { client } from "@openconsole/nacos";
 *
 * await client().fetch("nacos://user-service/users/me");
 * client().config.get("featureFlags", {});
 * ```
 *
 * @module
 */
import { Config } from "./config";
import { Discovery } from "./discovery";
import { loadEnvOptions } from "./env";
import { Http, NoInstanceError, TimeoutError } from "./http";
import { Plugins } from "./plugin";
import { Provider } from "./provider";
import { NacosRegistry } from "./registry";
import type {
  ConfigOptions,
  ConsumerOptions,
  FetchOptions,
  Hint,
  Instance,
  Options,
  Plugin,
  ProviderOptions,
  Registry,
  RegistryOptions,
} from "./types";

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

export {
  Config,
  Discovery,
  Http,
  NacosRegistry,
  NoInstanceError,
  Plugins,
  Provider,
  TimeoutError,
};
export { roundRobin, random, weighted, sticky, resolve as strategy } from "./balancer";
export {
  logger,
  headers,
  forward,
  context as makeContext,
  type ForwardOptions,
} from "./plugin";
export { loadEnvOptions, DEFAULT_SERVER } from "./env";

/**
 * Nacos 客户端句柄。由 {@link create} 构造，{@link init} / {@link client}
 * 返回的也是同一个对象。
 */
export interface Client {
  /** 启动生命周期：连接注册中心、拉取初始配置、（如启用）注册 provider。 */
  start(): Promise<void>;
  /** 反向逐层关闭。可重入。 */
  stop(): Promise<void>;

  /** 注册中心适配器。 */
  readonly registry: Registry;
  /** 实例发现 + 本地缓存层。 */
  readonly discovery: Discovery;
  /** HTTP 调用层。 */
  readonly http: Http;
  /** 服务提供方（启用 provider 时非 null）。 */
  readonly provider: Provider | null;
  /** 动态配置 API。 */
  readonly config: ConfigApi;
  /** 插件容器，可运行时挂载新插件。 */
  readonly plugins: Plugins;

  /** 服务感知的 fetch，支持 `nacos://service/path` 与原生 URL。 */
  fetch(input: string | URL | Request, init?: FetchOptions): Promise<Response>;
  /** 单独解析并返回一个健康实例；找不到时抛 {@link NoInstanceError}。 */
  discover(service: string, hint?: Hint): Promise<Instance>;
  /** 创建只针对单个服务的链式调用器。 */
  service(name: string): Service;
  /** 运行时挂载插件。 */
  use(plugin: Plugin): void;
}

/** 动态配置对外 API。 */
export interface ConfigApi {
  /** 读取指定 key；缺失时返回 fallback。 */
  get<T>(key: string, fallback: T): T;
  /** 读取指定 key；缺失时返回 undefined。 */
  get<T>(key: string): T | undefined;
  /** 不传 key 返回完整 snapshot。 */
  get(): Record<string, unknown>;
  /** 订阅 key 变更；返回取消订阅的句柄。 */
  on(listener: (key: string, value: unknown) => void): () => void;
  /** 主动触发 `revalidateTag`（如配置了 `config.tag`）。 */
  revalidate(): Promise<void>;
}

/**
 * 针对单个服务的链式调用器。由 {@link Client.service} 创建，自动处理：
 *
 * - URL 拼接：`nacos://<name><path>`
 * - body 序列化（FormData / Blob / URLSearchParams / 其它对象 → JSON）
 * - content-type 推断
 * - 响应解析（按 content-type 决定 .json() 或 .text()）
 */
export interface Service {
  /** 服务名。 */
  readonly name: string;
  /** 透传到 {@link Client.fetch}，返回原生 Response。 */
  fetch(path: string, init?: FetchOptions): Promise<Response>;
  /** GET 并自动解析响应。 */
  get<T = unknown>(path: string, init?: FetchOptions): Promise<T>;
  /** POST 并自动序列化 body / 解析响应。 */
  post<T = unknown>(path: string, body?: unknown, init?: FetchOptions): Promise<T>;
  /** PUT 并自动序列化 body / 解析响应。 */
  put<T = unknown>(path: string, body?: unknown, init?: FetchOptions): Promise<T>;
  /** DELETE 并自动解析响应。 */
  del<T = unknown>(path: string, init?: FetchOptions): Promise<T>;
}

/**
 * HTTP 非 2xx 响应专属错误。
 *
 * 由 {@link Service} 的 get/post/put/del 抛出（直接调用 `fetch` 不会自动抛，
 * 行为与原生 fetch 一致）。`body` 字段保留 4xx/5xx 响应体便于排查。
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`[nacos] HTTP ${status} ${statusText}`);
    this.name = "HttpError";
  }
}

/**
 * 创建一个 Nacos 客户端句柄（无单例语义）。
 *
 * 大多数 Next.js 应用应该用 {@link init} / {@link client}：本函数留给
 * 不需要单例的场景（测试、多实例并存、自管理生命周期）。
 */
export function create(options: Options): Client {
  const registry: Registry = new NacosRegistry(options.registry);
  const plugins = new Plugins(options.plugins ?? []);
  const discovery = new Discovery({
    registry,
    balancer: options.consumer?.balancer,
    ttl: options.consumer?.ttl,
  });
  const http = new Http({
    discovery,
    plugins,
    timeout: options.consumer?.timeout,
    retry: options.consumer?.retry,
  });
  const provider = options.provider?.enabled
    ? new Provider(registry, options.provider)
    : null;
  const config = new Config({ registry, options: options.config ?? {} });

  let running = false;

  const api: ConfigApi = {
    get: ((...args: unknown[]) =>
      (config.get as (...a: unknown[]) => unknown)(...args)) as ConfigApi["get"],
    on: (l) => config.on(l),
    revalidate: () => config.revalidate(),
  };

  return {
    registry,
    discovery,
    http,
    provider,
    config: api,
    plugins,

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

// Next.js 单例生命周期
//
// 全进程仅一个 Client，挂在 `globalThis` 上以便在 Next.js dev HMR 时存活
// —— 每次文件改动都重新注册到 Nacos 会泄漏 provider 条目与订阅。`init()`
// 在 `instrumentation.ts`（Node Runtime）调用一次；其它任何地方用
// `client()` 拿到共享实例。

declare global {
  // eslint-disable-next-line no-var
  var __nacos: Client | undefined;
}

let pending: Promise<Client> | null = null;

/**
 * {@link init} 的可选入参形状：每个字段都允许部分覆盖。
 *
 * 与完整的 {@link Options} 的区别是各嵌套对象都为 `Partial`，使得
 * `{ registry: { namespace: "x" } }` 这样的最小覆盖也能通过类型检查。
 * 实际生效的 {@link Options} 由 {@link loadEnvOptions} 的环境变量
 * 默认值与本对象浅合并得到。
 */
export interface OptionsOverride {
  registry?: Partial<RegistryOptions>;
  provider?: Partial<ProviderOptions>;
  consumer?: Partial<ConsumerOptions>;
  config?: Partial<ConfigOptions>;
  /** 覆盖完整插件数组；不传则保留环境默认（含 `forward()`）。 */
  plugins?: Plugin[];
}

/**
 * 启动 Next.js 单例 Client。
 *
 * 零配置启动：从 `process.env.NACOS_*` 加载默认值（细节见
 * {@link loadEnvOptions}）。传入的 `OptionsOverride` 会在默认值之上做
 * **浅合并** —— 每个 section（registry / provider / consumer / config）
 * 独立合并，`plugins` 整体替换。
 *
 * 行为要点：
 * - 可重复调用：并发调用去重，已初始化时返回已有实例。
 * - HMR 安全：通过 `globalThis.__nacos` 在热更新间存活。
 * - Edge Runtime 守护：在 `NEXT_RUNTIME !== "nodejs"` 时主动抛错。
 *
 * @example
 * ```ts
 * // 零配置：完全靠 process.env.NACOS_*
 * await init();
 *
 * // 局部覆盖：保留 env 默认值，只改 plugins
 * await init({ plugins: [logger(), forward()] });
 *
 * // 工厂形式：动态决定配置
 * await init(() => ({
 *   registry: { server: process.env.MY_NACOS_SERVER },
 *   provider: { enabled: true, service: "demo", port: 3000 },
 * }));
 * ```
 *
 * @param input 直接覆盖对象，或返回覆盖对象的工厂；不传则纯走 env 默认
 */
export async function init(
  input?: OptionsOverride | (() => OptionsOverride),
): Promise<Client> {
  if (pending) return pending;

  const existing = globalThis.__nacos;
  if (existing) {
    pending = Promise.resolve(existing);
    return pending;
  }

  pending = (async () => {
    if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
      throw new Error(
        "[nacos] requires the Node.js runtime. Guard with " +
          "`if (process.env.NEXT_RUNTIME === 'nodejs')` before importing.",
      );
    }
    const override = typeof input === "function" ? input() : (input ?? {});
    const resolved = mergeOptions(loadEnvOptions(), override);
    const c = create(resolved);
    globalThis.__nacos = c;
    try {
      await c.start();
    } catch (err) {
      globalThis.__nacos = undefined;
      pending = null;
      throw err;
    }
    return c;
  })();
  return pending;
}

/**
 * 把 env 默认值与调用方覆盖浅合并成完整 {@link Options}。
 *
 * - registry / consumer / config：逐字段 spread；override 字段优先。
 * - provider：合并后必须满足「enabled=true 且有 service & port」才保留，
 *   否则视为未启用并返回 undefined。
 * - plugins：override 设置即整体替换（包括 `[]`）；未设置时继承 base。
 */
function mergeOptions(base: Options, override: OptionsOverride): Options {
  return {
    registry: { ...base.registry, ...override.registry } as RegistryOptions,
    provider: mergeProvider(base.provider, override.provider),
    consumer: { ...base.consumer, ...override.consumer },
    config: mergeConfig(base.config, override.config),
    plugins: override.plugins ?? base.plugins,
  };
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

/**
 * 返回共享 Client；未 {@link init} 时抛错。
 *
 * 适合业务侧调用：调用栈一定在 `init()` 之后，未初始化属于真正的 bug。
 */
export function client(): Client {
  const c = globalThis.__nacos;
  if (!c) throw new Error("[nacos] not initialized; call init() first");
  return c;
}

/**
 * 返回共享 Client 或 null。
 *
 * 适合可能在 init() 之前运行的代码路径（极少见，例如启动期辅助工具）。
 */
export function tryClient(): Client | null {
  return globalThis.__nacos ?? null;
}

/**
 * 拆除单例（反注册 provider、关闭 SDK、清空 globalThis 槽）。可重入。
 *
 * 主要给测试 teardown 与强制重启用，业务代码通常不需要。
 */
export async function dispose(): Promise<void> {
  const c = globalThis.__nacos;
  globalThis.__nacos = undefined;
  pending = null;
  if (c) await c.stop();
}

/**
 * 构造单服务链式调用器。
 *
 * 内部细节：path 自动补 `/` 前缀；body 按 {@link prepareBody} 规则序列化；
 * 响应按 {@link parse} 解析；非 2xx 抛 {@link HttpError}。
 */
function buildService(name: string, http: Http): Service {
  const url = (path: string) =>
    `nacos://${name}${path.startsWith("/") ? path : `/${path}`}`;

  const send = async <T>(
    path: string,
    init: FetchOptions,
    body?: unknown,
  ): Promise<T> => {
    const final: FetchOptions = { ...init };
    if (body !== undefined) {
      const prepared = prepareBody(body);
      final.body = prepared.body;
      // 仅在调用方未自行设置 content-type 时叠加推断结果。
      const headers = new Headers(init.headers as HeadersInit | undefined);
      if (prepared.contentType && !headers.has("content-type")) {
        headers.set("content-type", prepared.contentType);
      }
      final.headers = headers;
    }
    return parse<T>(await http.fetch(url(path), final));
  };

  return {
    name,
    fetch: (path, init = {}) => http.fetch(url(path), init),
    get: (path, init = {}) => send(path, { ...init, method: "GET" }),
    post: (path, body, init = {}) =>
      send(path, { ...init, method: "POST" }, body),
    put: (path, body, init = {}) =>
      send(path, { ...init, method: "PUT" }, body),
    del: (path, init = {}) => send(path, { ...init, method: "DELETE" }),
  };
}

/** {@link prepareBody} 返回值。 */
interface PreparedBody {
  body: BodyInit;
  /** null 表示让 fetch 自行推断（例如 FormData 需要带 boundary）。 */
  contentType: string | null;
}

/**
 * 将任意业务对象转成可被 fetch 接受的 body。
 *
 * 识别 FormData / URLSearchParams / Blob / ArrayBuffer / ReadableStream，
 * 其余类型走 JSON.stringify。字符串视为已序列化的 JSON。
 */
function prepareBody(body: unknown): PreparedBody {
  // 字符串默认按 JSON 处理；想换 content-type 可在 init.headers 里覆盖。
  if (typeof body === "string") {
    return { body, contentType: "application/json" };
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return { body, contentType: null };
  }
  if (body instanceof URLSearchParams) {
    return {
      body,
      contentType: "application/x-www-form-urlencoded;charset=utf-8",
    };
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return { body, contentType: body.type || "application/octet-stream" };
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return {
      body: body as BodyInit,
      contentType: "application/octet-stream",
    };
  }
  if (
    typeof ReadableStream !== "undefined" &&
    body instanceof ReadableStream
  ) {
    return { body, contentType: "application/octet-stream" };
  }
  // 兜底：把对象 / 数组 / number / boolean / null 序列化为 JSON。
  return { body: JSON.stringify(body), contentType: "application/json" };
}

/**
 * 把 Response 解析成业务类型。
 *
 * - 非 2xx 抛 {@link HttpError}，附带 status / statusText / body。
 * - content-type 含 `application/json` 时走 `.json()`，否则走 `.text()`。
 */
async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new HttpError(res.status, res.statusText, body);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}
