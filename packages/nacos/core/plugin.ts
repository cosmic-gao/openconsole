import { NO_OP_RUNTIME, type Runtime } from "./runtime";
import type { Context, ErrorStep, Plugin, RequestStep, ResponseStep } from "./types";

export class Plugins {
  constructor(private readonly list: Plugin[] = []) {}

  use(plugin: Plugin) {
    this.list.push(plugin);
  }

  async request(step: RequestStep): Promise<Request> {
    let req = step.request;
    for (const p of this.list) {
      if (!p.onRequest) continue;
      const next = await p.onRequest({ request: req, context: step.context });
      if (next instanceof Request) req = next;
    }
    return req;
  }

  async response(step: ResponseStep): Promise<Response> {
    let res = step.response;
    for (const p of this.list) {
      if (!p.onResponse) continue;
      const next = await p.onResponse({
        request: step.request,
        response: res,
        context: step.context,
      });
      if (next instanceof Response) res = next;
    }
    return res;
  }

  async error(step: ErrorStep): Promise<void> {
    for (const p of this.list) {
      if (!p.onError) continue;
      try {
        await p.onError(step);
      } catch (err) {
        // 不重抛,以免遮蔽业务的原始错误;仅 warn 让插件 bug 可见。
        console.warn(`[nacos] plugin '${p.name}' onError threw`, err);
      }
    }
  }
}

export function context(
  service?: string,
  attempt = 0,
  runtime: Runtime = NO_OP_RUNTIME,
): Context {
  return {
    service,
    attempt,
    startedAt: Date.now(),
    startedAtPerf: performance.now(), // 单调时钟:算 elapsed 不受 NTP 调整影响。
    runtime,
  };
}

export interface LoggerOptions {
  logger?: Pick<Console, "info" | "warn" | "error">;
  success?: boolean;
}

export function logger(opts: LoggerOptions = {}): Plugin {
  const log = opts.logger ?? console;
  const success = opts.success ?? true;
  return {
    name: "logger",
    onResponse({ request, response, context }) {
      if (!success && response.ok) return;
      const ms = Math.round(performance.now() - context.startedAtPerf);
      const tag = `[nacos:${context.service ?? "direct"}]`;
      const line = `${tag} ${request.method} ${request.url} -> ${response.status} (${ms}ms)`;
      response.ok ? log.info(line) : log.warn(line);
    },
    onError({ request, error, context }) {
      const ms = Math.round(performance.now() - context.startedAtPerf);
      const tag = `[nacos:${context.service ?? "direct"}]`;
      log.error(`${tag} ${request.method} ${request.url} threw after ${ms}ms`, error);
    },
  };
}

export interface HeadersOptions {
  headers: Record<string, string>;
}

export function headers(opts: HeadersOptions): Plugin {
  // 构造时快照,后续修改原对象不影响已注册的插件。
  const entries = Object.entries({ ...opts.headers });
  return {
    name: "headers",
    onRequest({ request }) {
      const next = new Request(request, { headers: new Headers(request.headers) });
      for (const [k, v] of entries) next.headers.set(k, v);
      return next;
    },
  };
}

export interface ForwardOptions {
  exclude?: string[];
  internalOnly?: boolean;
}

// hop-by-hop 头描述上游 socket 而非负载本身,不能原样回放给下游(host 路由错、
// content-length / transfer-encoding 与新 body 冲突)。RFC 7230 §6.1。
const HOP_BY_HOP: ReadonlySet<string> = new Set([
  "host",
  "connection",
  "keep-alive",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "content-length",
]);

export function forward(opts: ForwardOptions = {}): Plugin {
  const skip = new Set<string>(HOP_BY_HOP);
  for (const h of opts.exclude ?? []) skip.add(h.toLowerCase());
  const internalOnly = opts.internalOnly ?? true;
  return {
    name: "forward",
    async onRequest({ request, context }) {
      if (internalOnly && !context.service) return;
      const incoming = await context.runtime.upstreamHeaders();
      if (!incoming) return;
      const next = new Request(request, { headers: new Headers(request.headers) });
      let injected = 0;
      incoming.forEach((value, name) => {
        if (skip.has(name.toLowerCase())) return;
        if (next.headers.has(name)) return;
        next.headers.set(name, value);
        injected++;
      });
      return injected > 0 ? next : undefined;
    },
  };
}
