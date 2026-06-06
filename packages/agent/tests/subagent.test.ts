import { describe, expect, it } from "vitest";

import { subagent } from "../src/agent";

import "../src/tools"; // 注册内置工具，供 subagent 按名解析

describe("subagent", () => {
  it("loads a bundled .agent into a SubAgent", async () => {
    const sub = await subagent("search");
    expect(sub.name).toBe("search");
    expect(sub.systemPrompt).toContain("web research");
    expect(sub.tools?.map((t) => t.name)).toContain("web_search");
    expect(sub.description).toBeTruthy();
  });
});
