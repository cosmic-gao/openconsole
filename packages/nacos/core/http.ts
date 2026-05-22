/**
 * Http — service-aware fetch.
 *
 * Pass `nacos://service/path` and the client resolves an instance via
 * Discovery + Balancer, then issues a plain `fetch`. Plain http/https URLs
 * pass through unchanged so one surface covers internal + external calls.
 *
 * Concerns layered here:
 *   - URL rewrite (`nacos://` → `http://ip:port`)
 *   - Timeout via AbortController, combined with the caller's signal
 *   - Retry (re-picks per attempt; re-clones the body per attempt)
 *   - Plugin pipeline (onRequest / onResponse / onError)
 */
import type { Discovery } from "./discovery";
import { Plugins, context } from "./plugin";
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
}

export class Http {
  constructor(private readonly opts: HttpOptions) {}

  async fetch(
    input: string | URL | Request,
    init: FetchOptions = {},
  ): Promise<Response> {
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

    // Streaming bodies can only be read once; refuse to retry instead of
    // silently corrupting attempt 2.
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
        // Clone preserves the body and signal across retries.
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

  /** Resolve a `nacos://` URL to a concrete `http(s)://ip:port/path` once. */
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
    // Explicit `init.scheme` wins; `?scheme=` is the legacy fallback.
    const resolved = opts.scheme ?? queryScheme;
    const scheme = resolved === "https" ? "https:" : "http:";
    parsed.searchParams.delete("scheme");
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

  // Prefer the native combinator when available (Node 20+, modern browsers).
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

  // Manual fallback: forward the first abort to a combined controller.
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

function isStreaming(body: BodyInit | null): boolean {
  return (
    typeof ReadableStream !== "undefined" && body instanceof ReadableStream
  );
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
