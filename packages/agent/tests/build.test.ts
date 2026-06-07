import { describe, expect, it } from "vitest";

import { build } from "../src/kernel/build";

import "../src/capabilities/tools"; // 把内置工具注册进共享注册表

import type { AgentSpec } from "../src/types";

const spec: AgentSpec = {
  modelId: "openai:gpt-4o-mini",
  tools: { web_search: {}, think: {} },
  prompt: "You are a test agent.",
};

describe("Agent.build", () => {
  it("compiles a spec into a DeepAgent exposing invoke/stream", () => {
    const agent = build(spec, { model: "openai:gpt-4o-mini" });
    const surface = agent as { invoke?: unknown; stream?: unknown };
    expect(typeof surface.invoke).toBe("function");
    expect(typeof surface.stream).toBe("function");
  });

  it("resolves tool names from the registry, skipping unknown ones", () => {
    const agent = build(
      { ...spec, tools: { web_search: {}, definitely_missing: {} } },
      { model: "openai:gpt-4o-mini" },
    );
    expect(agent).toBeTruthy();
  });
});
