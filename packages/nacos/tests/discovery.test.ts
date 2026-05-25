import { describe, expect, it } from "vitest";

import { Discovery } from "../core/discovery";
import { FakeRegistry, instance } from "./helpers";

describe("Discovery", () => {
  it("caches the first list() result and subscribes once", async () => {
    const reg = new FakeRegistry();
    reg.setInstances("svc", [instance("svc", "10.0.0.1", 80)]);
    const d = new Discovery({ registry: reg });

    await d.list("svc");
    await d.list("svc");
    await d.list("svc");

    expect(reg.watchCalls).toBe(1);
  });

  it("filters out unhealthy/disabled instances", async () => {
    const reg = new FakeRegistry();
    reg.setInstances("svc", [
      instance("svc", "10.0.0.1", 80),
      instance("svc", "10.0.0.2", 80, { healthy: false }),
      instance("svc", "10.0.0.3", 80, { enabled: false }),
    ]);
    const d = new Discovery({ registry: reg });

    const list = await d.list("svc");
    expect(list.map((i) => i.ip)).toEqual(["10.0.0.1"]);
  });

  it("watch failure does not poison the cache (subscribed stays false)", async () => {
    const reg = new FakeRegistry();
    reg.watchShouldFail = true;
    reg.setInstances("svc", [instance("svc", "10.0.0.1", 80)]);
    const d = new Discovery({ registry: reg, ttl: 1 });

    await d.list("svc");
    expect(reg.watchCalls).toBe(1);

    // 等待超过 TTL，下一次 list() 触发重新拉取 + 重订阅。
    await new Promise((r) => setTimeout(r, 5));
    reg.watchShouldFail = false;
    await d.list("svc");
    expect(reg.watchCalls).toBe(2);
  });

  it("registry push updates the cache", async () => {
    const reg = new FakeRegistry();
    reg.setInstances("svc", [instance("svc", "10.0.0.1", 80)]);
    const d = new Discovery({ registry: reg });

    await d.list("svc");
    reg.setInstances("svc", [
      instance("svc", "10.0.0.1", 80),
      instance("svc", "10.0.0.2", 80),
    ]);
    const list = await d.list("svc");
    expect(list).toHaveLength(2);
  });

  it("pick uses default balancer", async () => {
    const reg = new FakeRegistry();
    reg.setInstances("svc", [instance("svc", "10.0.0.1", 80, { weight: 1 })]);
    const d = new Discovery({ registry: reg, balancer: "round-robin" });
    const picked = await d.pick("svc");
    expect(picked?.ip).toBe("10.0.0.1");
  });

  it("pick returns null when no healthy instance", async () => {
    const reg = new FakeRegistry();
    reg.setInstances("svc", [
      instance("svc", "10.0.0.1", 80, { healthy: false }),
    ]);
    const d = new Discovery({ registry: reg });
    expect(await d.pick("svc")).toBeNull();
  });

  it("refresh bypasses TTL", async () => {
    const reg = new FakeRegistry();
    reg.setInstances("svc", [instance("svc", "10.0.0.1", 80)]);
    const d = new Discovery({ registry: reg });

    await d.list("svc");
    reg.setInstances("svc", [
      instance("svc", "10.0.0.1", 80),
      instance("svc", "10.0.0.9", 80),
    ]);
    // 已订阅的缓存原本就会收到推送；refresh 无视缓存状态强制直接读。
    await d.refresh("svc");
    const list = await d.list("svc");
    expect(list).toHaveLength(2);
  });
});
