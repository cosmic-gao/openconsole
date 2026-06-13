import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { createNacos, honoRuntime } from "../adapters/hono";
import { currentRequestHeaders } from "../core/scope";
import { Plugins, context, forward } from "../core/plugin";

describe("hono adapter", () => {
  it("createNacos returns client + middleware + lifecycle", () => {
    const nacos = createNacos({ registry: { server: "127.0.0.1:8848" } });
    expect(typeof nacos.client.fetch).toBe("function");
    expect(typeof nacos.middleware).toBe("function");
    expect(typeof nacos.start).toBe("function");
    expect(typeof nacos.stop).toBe("function");
  });

  it("honoRuntime.upstreamHeaders is null outside a request scope", () => {
    expect(honoRuntime.upstreamHeaders()).toBeNull();
  });

  it("middleware populates the shared ALS so forward() sees upstream headers", async () => {
    const nacos = createNacos();
    const app = new Hono();
    app.use("*", nacos.middleware);
    app.get("/x", async (c) => {
      const pipeline = new Plugins([forward()]);
      const req = await pipeline.request({
        request: new Request("nacos://svc/x"),
        context: context("svc", 0, honoRuntime),
      });
      return c.json({
        cookie: req.headers.get("cookie"),
        trace: req.headers.get("x-trace-id"),
        hasStore: currentRequestHeaders() !== null,
        onCtx: (c.get as (k: string) => unknown)("nacos") === nacos.client,
      });
    });

    const res = await app.request("/x", {
      headers: { cookie: "k=v", "x-trace-id": "t1" },
    });
    expect(await res.json()).toEqual({
      cookie: "k=v",
      trace: "t1",
      hasStore: true,
      onCtx: true,
    });
  });

  it("does not expose client on context when exposeOnContext=false", async () => {
    const nacos = createNacos({ exposeOnContext: false });
    const app = new Hono();
    app.use("*", nacos.middleware);
    app.get("/x", (c) =>
      c.json({ onCtx: (c.get as (k: string) => unknown)("nacos") ?? null }),
    );

    const res = await app.request("/x");
    expect(await res.json()).toEqual({ onCtx: null });
  });
});
