import { describe, expect, it } from "vitest";

import { parse, split } from "../src/parse";

describe("Agent.parse", () => {
  it("parses llm, tools (list -> record), and body", () => {
    const text = `---\nllm: main_llm\ntools:\n  - web_search\n  - think\n---\n<role>hi</role>\n`;
    const p = parse(text);
    expect(p.modelId).toBe("main_llm");
    expect(Object.keys(p.tools)).toEqual(["web_search", "think"]);
    expect(p.body).toContain("<role>hi</role>");
    expect(p.skills).toBeUndefined();
  });

  it("throws without frontmatter", () => {
    expect(() => parse("no frontmatter here")).toThrow(/frontmatter/);
  });

  it("throws when tools is missing", () => {
    expect(() => parse(`---\nllm: x\n---\nbody`)).toThrow(/tools/);
  });

  it("throws when llm is missing", () => {
    expect(() => parse(`---\ntools: [a]\n---\nbody`)).toThrow(/llm/);
  });

  it("parses a skills config", () => {
    const text = `---\nllm: main_llm\ntools: [web_search]\nskills:\n  system_skills: "*"\n  preload:\n    - name: foo\n---\nbody`;
    const p = parse(text);
    expect(p.skills?.system_skills).toBe("*");
    expect(p.skills?.preload).toEqual([{ name: "foo" }]);
  });
});

describe("split", () => {
  it("returns empty data when there is no frontmatter", () => {
    const { data, body } = split("# just markdown");
    expect(data).toEqual({});
    expect(body).toBe("# just markdown");
  });
});
