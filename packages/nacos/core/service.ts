import type { Http } from "./http";
import type { FetchOptions } from "./types";

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

export function buildService(name: string, http: Http): Service {
  const url = (path: string) =>
    `nacos://${name}${path.startsWith("/") ? path : `/${path}`}`;

  const send = async <T>(path: string, init: FetchOptions, body?: unknown): Promise<T> => {
    const final: FetchOptions = { ...init };
    if (body !== undefined) {
      const prepared = prepareBody(body);
      final.body = prepared.body;
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
    post: (path, body, init = {}) => send(path, { ...init, method: "POST" }, body),
    put: (path, body, init = {}) => send(path, { ...init, method: "PUT" }, body),
    del: (path, init = {}) => send(path, { ...init, method: "DELETE" }),
  };
}

interface PreparedBody {
  body: BodyInit;
  contentType: string | null;
}

function prepareBody(body: unknown): PreparedBody {
  if (typeof body === "string") return { body, contentType: "application/json" };
  if (body instanceof FormData) return { body, contentType: null };
  if (body instanceof URLSearchParams) {
    return { body, contentType: "application/x-www-form-urlencoded;charset=utf-8" };
  }
  if (body instanceof Blob) {
    return { body, contentType: body.type || "application/octet-stream" };
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return { body: body as BodyInit, contentType: "application/octet-stream" };
  }
  if (body instanceof ReadableStream) {
    return { body, contentType: "application/octet-stream" };
  }
  return { body: JSON.stringify(body), contentType: "application/json" };
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {}
    throw new HttpError(res.status, res.statusText, body);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}
