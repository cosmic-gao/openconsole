import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Discovery } from "../src/discovery";
import { Http, NoInstanceError, TimeoutError } from "../src/http";
import { Plugins } from "../src/plugin";
import { FakeRegistry, instance } from "./helpers";

function mkHttp(reg: FakeRegistry, opts?: { timeout?: number }) {
  const discovery = new Discovery({ registry: reg });
  const plugins = new Plugins([]);
  return new Http({ discovery, plugins, timeout: opts?.timeout });
}

describe("Http.resolve", () => {
  let reg: FakeRegistry;

  beforeEach(() => {
    reg = new FakeRegistry();
    reg.setInstances("svc", [instance("svc", "10.0.0.1", 8080)]);
  });

  it("rewrites nacos:// to http://ip:port", async () => {
    const http = mkHttp(reg);
    const url = await http.resolve("nacos://svc/users/me");
    expect(url).toBe("http://10.0.0.1:8080/users/me");
  });

  it("respects scheme=https query param", async () => {
    const http = mkHttp(reg);
    const url = await http.resolve("nacos://svc/path?scheme=https&x=1");
    expect(url).toBe("https://10.0.0.1:8080/path?x=1");
  });

  it("accepts uppercase scheme value (HTTPS)", async () => {
    const http = mkHttp(reg);
    const url = await http.resolve("nacos://svc/?scheme=HTTPS");
    expect(url).toBe("https://10.0.0.1:8080/");
  });

  it("throws NoInstanceError when no healthy instance", async () => {
    reg.setInstances("svc", [instance("svc", "10.0.0.1", 80, { healthy: false })]);
    const http = mkHttp(reg);
    await expect(http.resolve("nacos://svc/x")).rejects.toBeInstanceOf(
      NoInstanceError,
    );
  });
});

describe("Http.fetch", () => {
  let reg: FakeRegistry;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    reg = new FakeRegistry();
    reg.setInstances("svc", [instance("svc", "10.0.0.1", 8080)]);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rejects retry.attempts < 1", async () => {
    const http = mkHttp(reg);
    await expect(
      http.fetch("nacos://svc/x", { retry: { attempts: 0 } }),
    ).rejects.toThrow(/attempts must be a finite integer/);
  });

  it("retries on 500 and reads body each attempt", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: Request | string | URL) => {
      const req = input instanceof Request ? input : new Request(input);
      calls.push(await req.text());
      if (calls.length < 3) return new Response("err", { status: 500 });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const http = mkHttp(reg);
    const res = await http.fetch("nacos://svc/x", {
      method: "POST",
      body: "payload",
      retry: { attempts: 3, delays: [0, 0] },
    });
    expect(res.status).toBe(200);
    expect(calls).toEqual(["payload", "payload", "payload"]);
  });

  it("rejects ReadableStream body when attempts > 1", async () => {
    const http = mkHttp(reg);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("x"));
        c.close();
      },
    });
    await expect(
      http.fetch("nacos://svc/x", {
        method: "POST",
        body: stream,
        // @ts-expect-error duplex is required by undici when sending a stream
        duplex: "half",
        retry: { attempts: 2 },
      }),
    ).rejects.toThrow(/ReadableStream body/);
  });

  it("times out and aborts via AbortController", async () => {
    globalThis.fetch = vi.fn(
      (_input: Request | string | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal!.reason ?? new Error("aborted"));
          });
        }),
    ) as typeof fetch;

    const http = mkHttp(reg, { timeout: 20 });
    await expect(http.fetch("nacos://svc/x")).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });

  it("honors a caller-supplied AbortSignal alongside the timeout", async () => {
    globalThis.fetch = vi.fn(
      (_input: Request | string | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal!.reason ?? new Error("aborted"));
          });
        }),
    ) as typeof fetch;

    const http = mkHttp(reg, { timeout: 10_000 });
    const ac = new AbortController();
    const userReason = new Error("user-cancelled");
    setTimeout(() => ac.abort(userReason), 10);
    await expect(
      http.fetch("nacos://svc/x", { signal: ac.signal }),
    ).rejects.toBe(userReason);
  });

  it("plain http URLs pass through unchanged", async () => {
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (input: Request | string | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      seen.push(url);
      return new Response("ok");
    }) as typeof fetch;

    const http = mkHttp(reg);
    await http.fetch("https://example.com/path");
    expect(seen).toEqual(["https://example.com/path"]);
  });
});
