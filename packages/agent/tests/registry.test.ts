import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ToolRegistry } from "../src/kernel/registry";
import { Tool } from "../src/capabilities/tool";
import { ok } from "../src/types";

function makeTool(name: string) {
  return Tool.define({
    name,
    description: "test tool",
    schema: z.object({}),
    execute: () => ok("ok"),
  });
}

describe("ToolRegistry", () => {
  it("registers and resolves tools by name", () => {
    const r = new ToolRegistry();
    r.register(makeTool("a")).register(makeTool("b"));
    expect(r.has("a")).toBe(true);
    expect(r.get(["a", "b"]).map((t) => t.name)).toEqual(["a", "b"]);
  });

  it("warns and skips unknown names", () => {
    const r = new ToolRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(r.get(["nope"])).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
