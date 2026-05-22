/**
 * Plugin pipeline — axios/Koa-style chained interceptors.
 *
 * The Plugins class walks `onRequest` / `onResponse` / `onError` hooks in
 * declaration order. A hook returning a new Request/Response replaces the
 * in-flight one; returning void leaves it untouched. Errors thrown by
 * `onError` hooks are swallowed so the original failure isn't masked.
 */
import type {
  Context,
  ErrorStep,
  Plugin,
  RequestStep,
  ResponseStep,
} from "./types";

export class Plugins {
  constructor(private readonly list: Plugin[] = []) {}

  use(plugin: Plugin) {
    this.list.push(plugin);
  }

  async before(step: RequestStep): Promise<Request> {
    let req = step.request;
    for (const p of this.list) {
      if (!p.onRequest) continue;
      const next = await p.onRequest({ request: req, context: step.context });
      if (next instanceof Request) req = next;
    }
    return req;
  }

  async after(step: ResponseStep): Promise<Response> {
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

  async caught(step: ErrorStep): Promise<void> {
    for (const p of this.list) {
      if (!p.onError) continue;
      try {
        await p.onError(step);
      } catch {
        /* must not mask original */
      }
    }
  }
}

export function context(service?: string, attempt = 0): Context {
  return { service, attempt, startedAt: Date.now() };
}

// -- Built-in plugins ------------------------------------------------------

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
      const ms = Date.now() - context.startedAt;
      const tag = `[nacos:${context.service ?? "direct"}]`;
      const line = `${tag} ${request.method} ${request.url} -> ${response.status} (${ms}ms)`;
      response.ok ? log.info(line) : log.warn(line);
    },
    onError({ request, error, context }) {
      const ms = Date.now() - context.startedAt;
      const tag = `[nacos:${context.service ?? "direct"}]`;
      log.error(`${tag} ${request.method} ${request.url} threw after ${ms}ms`, error);
    },
  };
}

export interface HeadersOptions {
  headers: Record<string, string>;
}

export function headers(opts: HeadersOptions): Plugin {
  return {
    name: "headers",
    onRequest({ request }) {
      const next = new Request(request, { headers: new Headers(request.headers) });
      for (const [k, v] of Object.entries(opts.headers)) {
        next.headers.set(k, v);
      }
      return next;
    },
  };
}
