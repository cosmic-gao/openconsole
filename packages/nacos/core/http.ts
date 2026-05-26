/**
 * 服务感知的 HTTP 调用层。
 *
 * 调用方传 `nacos://service/path`，本模块会经过 {@link Discovery} +
 * 负载均衡器解析到具体实例，再用原生 `fetch` 发请求。原生 `http(s)://`
 * URL 原样穿透，于是内部 RPC 与外部 HTTP 调用共用同一个 API。
 *
 * 本层依次负责：
 * - URL 改写：`nacos://` → `http://ip:port`
 * - 超时：通过 AbortController 实现，与调用方传入的 signal 合并
 * - 重试：每次都重新挑实例，body 多次序列化重发
 * - 插件管线：`onRequest` / `onResponse` / `onError`
 *
 * @module
 */
import { markDynamic } from "./connection";
import type { Discovery } from "./discovery";
import { Plugins, context } from "./plugin";
import type { Balancer, FetchOptions, Hint, Retry } from "./types";

/** Nacos 逻辑 URL 的协议前缀。 */
export const PROTOCOL = "nacos:";

/**
 * 默认重试策略：不重试。需要重试时调用方传入 `{ attempts: N }` 即可，
 * `when` 默认认为「网络异常或 5xx 可重试」。
 */
const DEFAULT_RETRY: Retry = {
  attempts: 1,
  delays: [],
  when: ({ error, response }) =>
    Boolean(error) || (response !== undefined && response.status >= 500),
};

/** {@link Http} 构造参数。 */
export interface HttpOptions {
  discovery: Discovery;
  plugins: Plugins;
  /** 默认请求超时（毫秒）。 */
  timeout?: number;
  /** 默认重试策略。 */
  retry?: Retry;
}

/**
 * 服务感知的 fetch 实现。由 {@link create} 注入到 {@link Client.http}，
 * 业务方通常通过 `client.fetch()` / `client.service()` 间接调用。
 */
export class Http {
  constructor(private readonly opts: HttpOptions) {}

  /**
   * 发起一次请求。
   *
   * - `nacos://service/path` 会先解析实例再发请求；
   * - 原生 URL 直接转发；
   * - 重试 / 超时 / 插件管线对两种情况都生效。
   */
  async fetch(
    input: string | URL | Request,
    init: FetchOptions = {},
  ): Promise<Response> {
    // 第一步:把当前 Server Component 路由标记为 dynamic,让 Next.js 16
    // `cacheComponents` 模式接受后续的 `Date.now()` / `Math.random()`
    // (timing instrumentation、TTL、负载均衡)。非 Next 环境 / 非请求作用域
    // 下软降级,详见 `./connection.ts`。
    await markDynamic();

    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const logical = raw.startsWith(`${PROTOCOL}//`);
    const service = logical ? new URL(raw).hostname : undefined;
    const retry = init.retry ?? this.opts.retry ?? DEFAULT_RETRY;
    if (!Number.isFinite(retry.attempts) || retry.attempts < 1) {
      throw new Error(
        `[nacos] retry.attempts must be a finite integer >= 1, got ${retry.attempts}`,
      );
    }
    const attempts = Math.floor(retry.attempts);
    const when = retry.when ?? DEFAULT_RETRY.when!;
    const baseInit = strip(init);

    // 流式 body 只能消费一次，开启重试时拒绝它，免得第二次尝试拿到空 body。
    if (attempts > 1) {
      if (baseInit.body && isStreaming(baseInit.body)) {
        throw new Error(
          "[nacos] cannot retry a request with a ReadableStream body; " +
            "set retry.attempts=1 or buffer the body before sending",
        );
      }
      if (input instanceof Request && input.body !== null && !logical) {
        throw new Error(
          "[nacos] cannot retry a Request with a streaming body; " +
            "set retry.attempts=1 or pass body via init instead",
        );
      }
    }

    for (let attempt = 0; attempt < attempts; attempt++) {
      const ctx = context(service, attempt);
      const url = logical
        ? await this.resolve(raw, {
            balancer: init.balancer,
            hint: { ...init.hint, attempt },
            group: init.group,
            scheme: init.scheme,
          })
        : raw;

      let request: Request;
      if (input instanceof Request && !logical) {
        // 显式 clone() 保留 body 与 signal，重试时仍可重发。
        request = new Request(input.clone(), baseInit);
      } else {
        request = new Request(url, baseInit);
      }
      request = await this.opts.plugins.request({ request, context: ctx });

      const timeout = init.timeout ?? this.opts.timeout;
      const { signal, cleanup } = combineSignals(request.signal, timeout);

      try {
        const response = await fetch(request, { signal });
        const final = await this.opts.plugins.response({
          request,
          response,
          context: ctx,
        });
        if (attempt < attempts - 1 && when({ attempt, response: final })) {
          await sleep(retry.delays?.[attempt]);
          continue;
        }
        return final;
      } catch (error) {
        await this.opts.plugins.error({ request, error, context: ctx });
        if (attempt < attempts - 1 && when({ attempt, error })) {
          await sleep(retry.delays?.[attempt]);
          continue;
        }
        throw error;
      } finally {
        cleanup();
      }
    }

    throw new Error("[nacos] fetch loop exited without resolution");
  }

  /**
   * 把 `nacos://service/path` 解析为 `http(s)://ip:port/path`。
   *
   * 协议选择优先级：`init.scheme` > `?scheme=` query 参数 > `http`。
   * `?scheme=` 解析后会从 URL 中移除，避免泄露到下游。
   */
  async resolve(
    url: string,
    opts: {
      balancer?: Balancer;
      hint?: Hint;
      group?: string;
      scheme?: "http" | "https";
    } = {},
  ): Promise<string> {
    const parsed = new URL(url);
    const service = parsed.hostname;
    const picked = await this.opts.discovery.pick(service, {
      balancer: opts.balancer,
      hint: opts.hint,
      group: opts.group,
    });
    if (!picked) throw new NoInstanceError(service);
    const queryScheme = parsed.searchParams.get("scheme")?.toLowerCase();
    // 显式 init.scheme 优先；?scheme= 作为遗留兼容入口。
    const resolved = opts.scheme ?? queryScheme;
    const scheme = resolved === "https" ? "https:" : "http:";
    parsed.searchParams.delete("scheme");
    const search = parsed.searchParams.toString();
    const pathSearch = `${parsed.pathname}${search ? `?${search}` : ""}`;
    return `${scheme}//${picked.ip}:${picked.port}${pathSearch}`;
  }
}

/** 服务无可用实例时抛出。 */
export class NoInstanceError extends Error {
  constructor(public readonly service: string) {
    super(`[nacos] no healthy instance for service: ${service}`);
    this.name = "NoInstanceError";
  }
}

/** 单次请求超时时抛出。 */
export class TimeoutError extends Error {
  constructor(public readonly timeout: number) {
    super(`[nacos] request timed out after ${timeout}ms`);
    this.name = "TimeoutError";
  }
}

/** {@link combineSignals} 返回值。 */
interface CombinedSignal {
  /** 合并后的信号；无超时且无调用方信号时为 undefined。 */
  signal: AbortSignal | undefined;
  /** 清理定时器与监听器，必须在请求结束时（finally）调用。 */
  cleanup: () => void;
}

/**
 * 合并调用方 signal 与本地超时 signal。
 *
 * 优先使用原生 `AbortSignal.any`（Node 20+），不可用时手工把两个 signal
 * 的 abort 事件转发到统一的 AbortController。
 */
function combineSignals(
  requestSignal: AbortSignal | undefined,
  timeout: number | undefined,
): CombinedSignal {
  const noTimeout = !timeout || timeout <= 0;
  if (noTimeout) return { signal: requestSignal, cleanup: () => {} };

  const timeoutCtrl = new AbortController();
  const timer = setTimeout(
    () => timeoutCtrl.abort(new TimeoutError(timeout!)),
    timeout!,
  );

  if (!requestSignal) {
    return {
      signal: timeoutCtrl.signal,
      cleanup: () => clearTimeout(timer),
    };
  }

  // 优先使用原生 AbortSignal.any（Node 20+ / 现代浏览器）。
  const anyFn = (
    AbortSignal as unknown as {
      any?: (signals: AbortSignal[]) => AbortSignal;
    }
  ).any;
  if (typeof anyFn === "function") {
    return {
      signal: anyFn([requestSignal, timeoutCtrl.signal]),
      cleanup: () => clearTimeout(timer),
    };
  }

  // 兜底：把任一信号的 abort 事件转发到 combined 控制器。
  const combined = new AbortController();
  const forward = (e: Event) => {
    const target = e.target as AbortSignal;
    combined.abort(target.reason);
  };
  const sources = [requestSignal, timeoutCtrl.signal];
  for (const s of sources) {
    if (s.aborted) {
      combined.abort(s.reason);
      break;
    }
    s.addEventListener("abort", forward, { once: true });
  }
  return {
    signal: combined.signal,
    cleanup: () => {
      clearTimeout(timer);
      for (const s of sources) s.removeEventListener("abort", forward);
    },
  };
}

/** 是否是 ReadableStream，避免重试时读取已耗尽的流。 */
function isStreaming(body: BodyInit | null): boolean {
  return (
    typeof ReadableStream !== "undefined" && body instanceof ReadableStream
  );
}

/** 从 FetchOptions 中剥离 Nacos 私有字段，剩下纯 RequestInit。 */
function strip(init: FetchOptions): RequestInit {
  const { balancer, hint, timeout, retry, group, scheme, ...rest } = init;
  void [balancer, hint, timeout, retry, group, scheme];
  return rest;
}

/** Promise 化的 setTimeout；ms 缺省 / <= 0 时立即返回。 */
function sleep(ms?: number): Promise<void> {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}
