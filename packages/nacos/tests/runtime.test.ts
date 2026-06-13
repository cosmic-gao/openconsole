import { describe, expect, it } from "vitest";

import { currentRequestHeaders, withRequestHeaders } from "../core/scope";
import { NO_OP_RUNTIME } from "../core/runtime";

describe("NO_OP_RUNTIME", () => {
  it("markDynamic / revalidate are no-ops, upstreamHeaders is null", async () => {
    await NO_OP_RUNTIME.markDynamic();
    await NO_OP_RUNTIME.revalidate("any-tag");
    expect(NO_OP_RUNTIME.upstreamHeaders()).toBeNull();
  });

  it("is frozen", () => {
    expect(Object.isFrozen(NO_OP_RUNTIME)).toBe(true);
  });
});

describe("request-scope ALS", () => {
  it("currentRequestHeaders is null outside any scope", () => {
    expect(currentRequestHeaders()).toBeNull();
  });

  it("exposes headers within the callback, clears after", () => {
    const h = new Headers({ cookie: "k=v" });
    const inside = withRequestHeaders(h, () => currentRequestHeaders());
    expect(inside).toBe(h);
    expect(currentRequestHeaders()).toBeNull();
  });

  it("nests and isolates async scopes", async () => {
    const outer = new Headers({ x: "outer" });
    await withRequestHeaders(outer, async () => {
      expect(currentRequestHeaders()?.get("x")).toBe("outer");
      const inner = new Headers({ x: "inner" });
      await withRequestHeaders(inner, async () => {
        expect(currentRequestHeaders()?.get("x")).toBe("inner");
      });
      expect(currentRequestHeaders()?.get("x")).toBe("outer");
    });
    expect(currentRequestHeaders()).toBeNull();
  });
});
