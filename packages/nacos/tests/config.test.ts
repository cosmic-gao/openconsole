import { describe, expect, it, vi } from "vitest";

import { Config } from "../src/config";
import { FakeRegistry } from "./helpers";

describe("Config", () => {
  it("parses JSON content into the snapshot", async () => {
    const reg = new FakeRegistry();
    reg.setConfig("app.json", JSON.stringify({ feature: { x: true } }));
    const c = new Config({
      registry: reg,
      options: { sources: [{ dataId: "app.json", key: "app" }] },
    });
    await c.start();
    expect(c.get<{ feature: { x: boolean } }>("app")).toEqual({
      feature: { x: true },
    });
  });

  it("returns the raw string when content is not JSON", async () => {
    const reg = new FakeRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reg.setConfig("plain.txt", "hello world");
    const c = new Config({
      registry: reg,
      options: { sources: [{ dataId: "plain.txt" }] },
    });
    await c.start();
    expect(c.get("plain.txt")).toBe("hello world");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("get() with fallback returns fallback for missing keys", async () => {
    const reg = new FakeRegistry();
    const c = new Config({ registry: reg, options: {} });
    await c.start();
    expect(c.get("nope", "default")).toBe("default");
    expect(c.get<string>("nope")).toBeUndefined();
  });

  it("registry push updates the snapshot and notifies listeners", async () => {
    const reg = new FakeRegistry();
    reg.setConfig("app.json", JSON.stringify({ v: 1 }));
    const c = new Config({
      registry: reg,
      options: { sources: [{ dataId: "app.json", key: "app" }] },
    });
    await c.start();

    const seen: Array<[string, unknown]> = [];
    c.on((k, v) => seen.push([k, v]));

    reg.setConfig("app.json", JSON.stringify({ v: 2 }));
    // Listener notification is sync; revalidate() runs async but doesn't
    // affect the snapshot itself. Allow microtasks to flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(c.get<{ v: number }>("app")?.v).toBe(2);
    expect(seen).toEqual([["app", { v: 2 }]]);
  });

  it("stop() unsubscribes and clears listeners", async () => {
    const reg = new FakeRegistry();
    reg.setConfig("app.json", "{}");
    const c = new Config({
      registry: reg,
      options: { sources: [{ dataId: "app.json" }] },
    });
    await c.start();
    await c.stop();
    expect(reg.unobserveCalls).toBe(1);

    // Subsequent push must not propagate after stop.
    let fired = false;
    c.on(() => {
      fired = true;
    });
    reg.setConfig("app.json", JSON.stringify({ v: 99 }));
    await Promise.resolve();
    expect(fired).toBe(false);
  });

  it("start() and stop() are idempotent", async () => {
    const reg = new FakeRegistry();
    reg.setConfig("a.json", "{}");
    const c = new Config({
      registry: reg,
      options: { sources: [{ dataId: "a.json" }] },
    });
    await c.start();
    await c.start();
    await c.stop();
    await c.stop();
    expect(reg.unobserveCalls).toBe(1);
  });
});
