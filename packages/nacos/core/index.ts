/**
 * @opendesign/nacos — main entry.
 *
 *   import { create, logger } from '@opendesign/nacos';
 *
 *   const nacos = create({
 *     registry: { server: '127.0.0.1:8848' },
 *     provider: { enabled: true, service: 'nextjs-admin', port: 3000 },
 *     consumer: { balancer: 'weighted', retry: { attempts: 3 } },
 *     config: { sources: [{ dataId: 'app.json' }], tag: 'app-config' },
 *     plugins: [logger()],
 *   });
 *   await nacos.start();
 *
 *   await nacos.fetch('nacos://user-service/users/me');
 *   nacos.config.get('featureFlags', {});
 */
import { Config } from "./config";
import { Discovery } from "./discovery";
import { Http, NoInstanceError, TimeoutError } from "./http";
import { Plugins } from "./plugin";
import { Provider } from "./provider";
import { NacosRegistry } from "./registry";
import type {
  FetchOptions,
  Hint,
  Instance,
  Options,
  Plugin,
  Registry,
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
export { logger, headers, context as makeContext } from "./plugin";
export { Adapter, type AdapterConfig } from "./adapter";

export interface Client {
  /** Lifecycle. */
  start(): Promise<void>;
  stop(): Promise<void>;

  /** Low-level handles. */
  readonly registry: Registry;
  readonly discovery: Discovery;
  readonly http: Http;
  readonly provider: Provider | null;
  readonly config: ConfigApi;
  readonly plugins: Plugins;

  /** Service-aware fetch (`nacos://service/path`). */
  fetch(input: string | URL | Request, init?: FetchOptions): Promise<Response>;
  /** Resolve and return one instance (throws when none healthy). */
  discover(service: string, hint?: Hint): Promise<Instance>;
  /** Fluent sub-client scoped to one service. */
  service(name: string): Service;
  /** Add a plugin at runtime. */
  use(plugin: Plugin): void;
}

export interface ConfigApi {
  get<T>(key: string, fallback: T): T;
  get<T>(key: string): T | undefined;
  get(): Record<string, unknown>;
  on(listener: (key: string, value: unknown) => void): () => void;
  revalidate(): Promise<void>;
}

export interface Service {
  readonly name: string;
  fetch(path: string, init?: FetchOptions): Promise<Response>;
  get<T = unknown>(path: string, init?: FetchOptions): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, init?: FetchOptions): Promise<T>;
  put<T = unknown>(path: string, body?: unknown, init?: FetchOptions): Promise<T>;
  del<T = unknown>(path: string, init?: FetchOptions): Promise<T>;
}

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
      // Layer the inferred content-type only when the caller didn't set one.
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

interface PreparedBody {
  body: BodyInit;
  /** null = let fetch infer (e.g., FormData needs the multipart boundary). */
  contentType: string | null;
}

function prepareBody(body: unknown): PreparedBody {
  // Strings default to JSON; override via `init.headers["content-type"]`.
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
  // Default: JSON-serialize plain objects/arrays/numbers/booleans/null.
  return { body: JSON.stringify(body), contentType: "application/json" };
}

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
