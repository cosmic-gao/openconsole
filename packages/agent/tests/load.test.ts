import { describe, expect, it } from "vitest";

import { load } from "../src/load";

describe("Agent.load", () => {
  it("loads and fully renders the bundled search agent", async () => {
    const spec = await load("search");

    expect(spec.modelId).toBe("main_llm");
    expect(Object.keys(spec.tools)).toContain("web_search");
    expect(Object.keys(spec.tools)).toContain("read_webpages_as_markdown");

    // 提示词已完整渲染：不应残留模板标记，也不应残留 zh 注释。
    expect(spec.prompt).not.toContain("{{");
    expect(spec.prompt).not.toContain("<!--zh");
    expect(spec.prompt).not.toContain("开发者注释");

    // @include 已把共享的提示词片段内联进来。
    expect(spec.prompt).toContain("DeepAgent-based runtime");
  });
});
