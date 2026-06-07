import { describe, expect, it } from "vitest";

import { ModelRegistry } from "../src/kernel/model";

describe("ModelRegistry", () => {
  it("registers and resolves a provider:model alias", () => {
    const m = new ModelRegistry();
    m.register("main", "anthropic:claude-sonnet-4-5");
    expect(m.has("main")).toBe(true);
    expect(m.resolve("main")).toBe("anthropic:claude-sonnet-4-5");
  });

  it("registers many aliases at once", () => {
    const m = new ModelRegistry();
    m.registerAll({ a: "anthropic:x", b: "anthropic:y" });
    expect(m.resolve("a")).toBe("anthropic:x");
    expect(m.resolve("b")).toBe("anthropic:y");
  });

  it("passes through a bare provider:model id when unregistered", () => {
    expect(new ModelRegistry().resolve("anthropic:claude-x")).toBe(
      "anthropic:claude-x",
    );
  });

  it("returns a registered chat-model instance as-is", () => {
    const m = new ModelRegistry();
    const instance = {} as never;
    m.register("inst", instance);
    expect(m.resolve("inst")).toBe(instance);
  });

  it("throws for an unknown alias with no env or provider", () => {
    const saved = process.env["AGENT_MODEL"];
    delete process.env["AGENT_MODEL"];
    try {
      expect(() =>
        new ModelRegistry().resolve("totally_unknown_xyz"),
      ).toThrow();
    } finally {
      if (saved !== undefined) process.env["AGENT_MODEL"] = saved;
    }
  });
});
