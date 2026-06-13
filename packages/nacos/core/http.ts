import type { Discovery } from "./discovery";
import { Plugins, context } from "./plugin";
import { NO_OP_RUNTIME, type Runtime } from "./runtime";
import type { Balancer, FetchOptions, Hint, Retry } from "./types";

export const PROTOCOL = "nacos:";

const DEFAULT_RETRY: Retry = {
  attempts: 1,
  delays: [],
  when: ({ error, response }) =>
    Boolean(error) || (response !== undefined && response.status >= 500),
};

export interface HttpOptions {
  discovery: Discovery;
  plugins: Plugins;
  timeout?: number;
  retry?: Retry;
  runtime?: Runtime;
}

export class Http {
  private readonly runtime: Runtime;

  constructor(private readonly opts: HttpOptions) {
    this.runtime = opts.runtime ?? NO_OP_RUNTIME;
  }

  async fetch(input: string | URL | Request, init: FetchOptions = {}): Promise<Response> {
    // 标记 dynamic:Next 16 Cache Components 放行后续 Date.now() / Math.random();其它框架 no-op,须幂等。
    await this.runtime.markDynamic();

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

    // 流只能消费一次,开重试时拒绝它,免得第二次尝试拿到空 body。
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
      const ctx = context(service, attempt, this.runtime);
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
        // clone() 保留 body 与 signal,重试时仍可重发。
        request = new Request(input.clone(), baseInit);
      } else {
        request = new Request(url, baseInit);
      }
      request = await this.opts.plugins.request({ request, context: ctx });

      const timeout = init.timeout ?? this.opts.timeout;
      const { signal, cleanup } = combineSignals(request.signal, timeout);

      try {
        const response = await fetch(request, { signal });
        const final = await this.opts.plugins.response({ request, response, context: ctx });
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

  async resolve(
    url: string,
    opts: { balancer?: Balancer; hint?: Hint; group?: string; scheme?: "http" | "https" } = {},
  ): Promise<string> {
    const parsed = new URL(url);
    const service = parsed.hostname;
    const picked = await this.opts.discovery.pick(service, {
      balancer: opts.balancer,
      hint: opts.hint,
      group: opts.group,
    });
    if (!picked) throw new NoInstanceError(service);
    const scheme = opts.scheme === "https" ? "https:" : "http:";
    const search = parsed.searchParams.toString();
    const pathSearch = `${parsed.pathname}${search ? `?${search}` : ""}`;
    return `${scheme}//${picked.ip}:${picked.port}${pathSearch}`;
  }
}

export class NoInstanceError extends Error {
  constructor(public readonly service: string) {
    super(`[nacos] no healthy instance for service: ${service}`);
    this.name = "NoInstanceError";
  }
}

export class TimeoutError extends Error {
  constructor(public readonly timeout: number) {
    super(`[nacos] request timed out after ${timeout}ms`);
    this.name = "TimeoutError";
  }
}

interface CombinedSignal {
  signal: AbortSignal | undefined;
  cleanup: () => void;
}

function combineSignals(
  requestSignal: AbortSignal | undefined,
  timeout: number | undefined,
): CombinedSignal {
  if (!timeout || timeout <= 0) return { signal: requestSignal, cleanup: () => {} };

  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(new TimeoutError(timeout)), timeout);
  // 原生 AbortSignal.any 合并调用方 signal 与超时 signal(Node ≥22.11)。
  const signal = requestSignal
    ? AbortSignal.any([requestSignal, timeoutCtrl.signal])
    : timeoutCtrl.signal;
  return { signal, cleanup: () => clearTimeout(timer) };
}

function isStreaming(body: BodyInit | null): boolean {
  return body instanceof ReadableStream;
}

function strip(init: FetchOptions): RequestInit {
  const { balancer, hint, timeout, retry, group, scheme, ...rest } = init;
  void [balancer, hint, timeout, retry, group, scheme];
  return rest;
}

function sleep(ms?: number): Promise<void> {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}
