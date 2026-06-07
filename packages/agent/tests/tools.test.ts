import { describe, expect, it, vi } from "vitest";

import { currentTimeTool, httpRequestTool, toMarkdownTool } from "../src/capabilities/tools";

/** content_and_artifact 工具的 invoke(args) 返回 content(string);兼容取值。 */
function text(out: unknown): string {
  return typeof out === "string"
    ? out
    : String((out as { content?: unknown }).content ?? out);
}

describe("builtin tools", () => {
  it("html_to_markdown converts HTML", async () => {
    const out = await toMarkdownTool.invoke({ html: "<h1>Hi</h1><p>x</p>" });
    expect(text(out)).toContain("# Hi");
  });

  it("current_time returns a date", async () => {
    const out = await currentTimeTool.invoke({});
    expect(text(out)).toMatch(/\d{4}/);
  });

  it("http_request parses a (mocked) response", async () => {
    const fetchMock = vi.fn(
      async () => new Response("hello", { status: 200, statusText: "OK" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const out = await httpRequestTool.invoke({
        url: "https://example.test/",
      });
      expect(text(out)).toContain("HTTP 200");
      expect(text(out)).toContain("hello");
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
