import { LocalShellBackend, StateBackend } from "deepagents";
import { describe, expect, it } from "vitest";

import { Sandbox } from "../src/sandbox";

describe("Sandbox.runJs", () => {
  it("evaluates an expression", async () => {
    const r = await Sandbox.runJs("1 + 1");
    expect(r.ok).toBe(true);
    expect(r.result).toBe(2);
  });

  it("captures console.log", async () => {
    const r = await Sandbox.runJs("console.log('hi', 42); 'done'");
    expect(r.ok).toBe(true);
    expect(r.logs).toContain("hi 42");
    expect(r.result).toBe("done");
  });

  it("has no Node APIs (isolated)", async () => {
    const r = await Sandbox.runJs("typeof process");
    expect(r.ok).toBe(true);
    expect(r.result).toBe("undefined");
  });

  it("interrupts on timeout", async () => {
    const r = await Sandbox.runJs("while (true) {}", { timeoutMs: 200 });
    expect(r.ok).toBe(false);
  });

  it("reports runtime errors", async () => {
    const r = await Sandbox.runJs("throw new Error('boom')");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("boom");
  });
});

describe("Sandbox backends", () => {
  it("state() is a StateBackend (virtual FS, no execution)", () => {
    expect(Sandbox.state()).toBeInstanceOf(StateBackend);
  });

  it("local() is a LocalShellBackend", () => {
    expect(Sandbox.local()).toBeInstanceOf(LocalShellBackend);
  });
});
