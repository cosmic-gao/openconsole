import { describe, expect, it } from "vitest";
import { z } from "zod";

import { build } from "../src/build";
import { Tool } from "../src/tool";
import { ok, type AgentSpec } from "../src/types";

import "../src/tools"; // 把内置工具注册进共享注册表

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

  it("merges plugin tools into the compiled agent via the plugins option", () => {
    const echo = Tool.define({
      name: "echo_plugin_tool",
      description: "echo",
      schema: z.object({}),
      execute: () => ok("ok"),
    });
    const agent = build(spec, {
      model: "openai:gpt-4o-mini",
      plugins: [{ name: "demo", tools: [echo] }],
    });
    expect(typeof (agent as { invoke?: unknown }).invoke).toBe("function");
  });
});
