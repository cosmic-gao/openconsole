import { describe, expect, it } from "vitest";

import {
  callable,
  random,
  resolve,
  roundRobin,
  sticky,
  weighted,
} from "../src/balancer";
import { instance } from "./helpers";

describe("balancer", () => {
  describe("roundRobin", () => {
    it("cycles instances in order", () => {
      const b = roundRobin();
      const list = [
        instance("svc", "10.0.0.1", 80),
        instance("svc", "10.0.0.2", 80),
        instance("svc", "10.0.0.3", 80),
      ];
      const picks = Array.from({ length: 6 }, () => b.pick(list)!.ip);
      expect(picks).toEqual([
        "10.0.0.1",
        "10.0.0.2",
        "10.0.0.3",
        "10.0.0.1",
        "10.0.0.2",
        "10.0.0.3",
      ]);
    });

    it("returns null on empty", () => {
      expect(roundRobin().pick([])).toBeNull();
    });
  });

  describe("weighted", () => {
    it("respects weights over many samples", () => {
      const b = weighted();
      const list = [
        instance("svc", "10.0.0.1", 80, { weight: 1 }),
        instance("svc", "10.0.0.2", 80, { weight: 9 }),
      ];
      const counts = new Map<string, number>();
      for (let i = 0; i < 10_000; i++) {
        const p = b.pick(list)!;
        counts.set(p.ip, (counts.get(p.ip) ?? 0) + 1);
      }
      // Expect ~10% / ~90% split with wide tolerance.
      expect(counts.get("10.0.0.2")! / 10_000).toBeGreaterThan(0.85);
      expect(counts.get("10.0.0.2")! / 10_000).toBeLessThan(0.95);
    });

    it("falls back to first when total weight is 0", () => {
      const b = weighted();
      const list = [
        instance("svc", "10.0.0.1", 80, { weight: 0 }),
        instance("svc", "10.0.0.2", 80, { weight: 0 }),
      ];
      const p = b.pick(list)!;
      expect(["10.0.0.1", "10.0.0.2"]).toContain(p.ip);
    });
  });

  describe("sticky", () => {
    it("same key picks the same instance", () => {
      const b = sticky();
      const list = [
        instance("svc", "10.0.0.1", 80),
        instance("svc", "10.0.0.2", 80),
        instance("svc", "10.0.0.3", 80),
      ];
      const a = b.pick(list, { key: "user-42" });
      const c = b.pick(list, { key: "user-42" });
      expect(a).toBe(c);
    });

    it("missing key falls back to first", () => {
      const b = sticky();
      const list = [instance("svc", "10.0.0.1", 80)];
      expect(b.pick(list)).toBe(list[0]);
    });
  });

  describe("random", () => {
    it("picks an element from the list", () => {
      const b = random();
      const list = [instance("svc", "10.0.0.1", 80)];
      expect(b.pick(list)).toBe(list[0]);
      expect(b.pick([])).toBeNull();
    });
  });

  describe("resolve", () => {
    it("maps strings to factories", () => {
      expect(resolve("round-robin").name).toBe("round-robin");
      expect(resolve("weighted").name).toBe("weighted");
      expect(resolve("random").name).toBe("random");
      expect(resolve("sticky").name).toBe("sticky");
      expect(resolve(undefined).name).toBe("weighted");
    });

    it("passes through balancer objects", () => {
      const custom = { name: "custom", pick: () => null };
      expect(resolve(custom)).toBe(custom);
    });

    it("throws on unknown strings", () => {
      expect(() => resolve("nonsense" as never)).toThrow(/unknown balancer/);
    });
  });

  describe("callable", () => {
    it("keeps only healthy+enabled instances", () => {
      const list = [
        instance("s", "1.1.1.1", 80),
        instance("s", "2.2.2.2", 80, { healthy: false }),
        instance("s", "3.3.3.3", 80, { enabled: false }),
      ];
      expect(callable(list)).toHaveLength(1);
      expect(callable(list)[0].ip).toBe("1.1.1.1");
    });
  });
});
