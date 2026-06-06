import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { registry } from "../src/registry";
import { downloadTool, imageSearchTool, runPythonTool } from "../src/tools";

function text(out: unknown): string {
  return typeof out === "string"
    ? out
    : String((out as { content?: unknown }).content ?? out);
}

describe("io tools", () => {
  it("registers image_search / download / run_python", () => {
    expect(registry.has("image_search")).toBe(true);
    expect(registry.has("download")).toBe(true);
    expect(registry.has("run_python")).toBe(true);
    expect(imageSearchTool.name).toBe("image_search");
  });

  it("download saves bytes to a file (mocked fetch)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-dl-"));
    const dest = join(dir, "out.txt");
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([104, 105]), {
          status: 200,
          statusText: "OK",
        }), // "hi"
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      await downloadTool.invoke({ url: "https://example.test/y", path: dest });
      expect(readFileSync(dest, "utf8")).toBe("hi");
    } finally {
      vi.unstubAllGlobals();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("run_python returns a string result (python3 optional)", async () => {
    const out = await runPythonTool.invoke({ code: "print(40 + 2)" });
    expect(typeof text(out)).toBe("string");
  });
});
