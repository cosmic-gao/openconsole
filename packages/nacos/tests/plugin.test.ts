import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Plugins, context, forward, headers as headersPlugin } from "../core/plugin";

// 实时 mock：每个用例重置 `upstream` 来控制 next/headers 的返回值。
let upstream: Headers | Error | null;

vi.mock("next/headers", () => ({
  headers: () => {
    if (upstream instanceof Error) throw upstream;
    if (upstream === null) throw new Error("next/headers called outside scope");
    return Promise.resolve(upstream);
  },
}));

function run(
  request: Request,
  service: string | undefined,
  pipeline: Plugins,
): Promise<Request> {
  return pipeline.request({ request, context: context(service) });
}

describe("forward()", () => {
  beforeEach(() => {
    upstream = new Headers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mirrors upstream headers onto nacos:// requests", async () => {
    upstream = new Headers({
      cookie: "token=abc; tenant=t1",
      "x-trace-id": "trace-1",
      "accept-language": "en-US",
    });

    const pipeline = new Plugins([forward()]);
    const next = await run(
      new Request("nacos://svc/users", { method: "GET" }),
      "svc",
      pipeline,
    );

    expect(next.headers.get("cookie")).toBe("token=abc; tenant=t1");
    expect(next.headers.get("x-trace-id")).toBe("trace-1");
    expect(next.headers.get("accept-language")).toBe("en-US");
  });

  it("skips hop-by-hop headers", async () => {
    upstream = new Headers({
      host: "upstream.example.com",
      "content-length": "999",
      "transfer-encoding": "chunked",
      connection: "keep-alive",
      "x-real-header": "real",
    });

    const pipeline = new Plugins([forward()]);
    const next = await run(
      new Request("nacos://svc/x", { method: "GET" }),
      "svc",
      pipeline,
    );

    expect(next.headers.get("host")).toBeNull();
    expect(next.headers.get("content-length")).toBeNull();
    expect(next.headers.get("transfer-encoding")).toBeNull();
    expect(next.headers.get("connection")).toBeNull();
    expect(next.headers.get("x-real-header")).toBe("real");
  });

  it("respects exclude list", async () => {
    upstream = new Headers({
      cookie: "k=v",
      "x-debug": "noisy",
    });

    const pipeline = new Plugins([forward({ exclude: ["X-Debug"] })]);
    const next = await run(
      new Request("nacos://svc/x"),
      "svc",
      pipeline,
    );

    expect(next.headers.get("cookie")).toBe("k=v");
    expect(next.headers.get("x-debug")).toBeNull();
  });

  it("caller-set headers win over upstream", async () => {
    upstream = new Headers({ "x-tenant": "from-upstream" });

    const pipeline = new Plugins([forward()]);
    const next = await run(
      new Request("nacos://svc/x", { headers: { "x-tenant": "caller-set" } }),
      "svc",
      pipeline,
    );

    expect(next.headers.get("x-tenant")).toBe("caller-set");
  });

  it("skips external URLs when internalOnly (default)", async () => {
    upstream = new Headers({ cookie: "k=v" });

    const pipeline = new Plugins([forward()]);
    const next = await run(
      new Request("https://api.openai.com/v1"),
      undefined, // no service → external call
      pipeline,
    );

    expect(next.headers.get("cookie")).toBeNull();
  });

  it("forwards on external URLs when internalOnly=false", async () => {
    upstream = new Headers({ "x-trace-id": "trace-1" });

    const pipeline = new Plugins([forward({ internalOnly: false })]);
    const next = await run(
      new Request("https://api.openai.com/v1"),
      undefined,
      pipeline,
    );

    expect(next.headers.get("x-trace-id")).toBe("trace-1");
  });

  it("degrades to a no-op outside a request scope", async () => {
    upstream = null; // headers() will throw

    const pipeline = new Plugins([forward()]);
    const original = new Request("nacos://svc/x");
    const next = await run(original, "svc", pipeline);

    // 无上游 → 不修改请求；原 Request 原样穿过。
    expect(next).toBe(original);
  });
});

describe("headers()", () => {
  it("layers static headers onto every request", async () => {
    const pipeline = new Plugins([
      headersPlugin({ headers: { authorization: "Bearer secret", "x-app": "demo" } }),
    ]);

    const next = await pipeline.request({
      request: new Request("nacos://svc/x"),
      context: context("svc"),
    });

    expect(next.headers.get("authorization")).toBe("Bearer secret");
    expect(next.headers.get("x-app")).toBe("demo");
  });

  it("snapshots options at construction time", async () => {
    const opts: { headers: Record<string, string> } = {
      headers: { "x-snap": "v1" },
    };
    const pipeline = new Plugins([headersPlugin(opts)]);

    // 构造之后修改调用方对象不应影响已注册的插件。
    opts.headers["x-snap"] = "v2";

    const next = await pipeline.request({
      request: new Request("nacos://svc/x"),
      context: context("svc"),
    });

    expect(next.headers.get("x-snap")).toBe("v1");
  });
});
