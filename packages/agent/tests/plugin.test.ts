import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { MiddlewareRegistry } from "../src/middleware";
import { ModelRegistry } from "../src/model";
import { collect, plugins, use, type Plugin } from "../src/plugin";
import { ToolRegistry } from "../src/registry";
import { Tool } from "../src/tool";
import { ok } from "../src/types";

function makeTool(name: string) {
  return Tool.define({
    name,
    description: "test tool",
    schema: z.object({}),
    execute: () => ok("ok"),
  });
}

describe("plugin", () => {
  it("use merges tools/models into target registries, runs setup, and records the plugin", async () => {
    const tools = new ToolRegistry();
    const models = new ModelRegistry();
    const middlewares = new MiddlewareRegistry();
    let setupRan = false;
    const p: Plugin = {
      name: "demo",
      tools: [makeTool("echo")],
      models: { demo_llm: "openai:gpt-4o-mini" },
      setup: () => {
        setupRan = true;
      },
    };
    const off = await use([p], { tools, models, middlewares });
    expect(tools.has("echo")).toBe(true);
    expect(models.has("demo_llm")).toBe(true);
    expect(setupRan).toBe(true);
    expect(plugins.has("demo")).toBe(true);
    await off();
  });

  it("teardown runs setup-returned cleanups in reverse order", async () => {
    const tools = new ToolRegistry();
    const order: string[] = [];
    const a: Plugin = {
      name: "a",
      setup: () => () => {
        order.push("a");
        return Promise.resolve();
      },
    };
    const b: Plugin = {
      name: "b",
      setup: () => () => {
        order.push("b");
        return Promise.resolve();
      },
    };
    const off = await use([a, b], { tools });
    await off();
    expect(order).toEqual(["b", "a"]); // 后装的先卸
  });

  it("warns when a plugin tool overrides an already-registered name", async () => {
    const tools = new ToolRegistry();
    tools.register(makeTool("dup"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await use([{ name: "p", tools: [makeTool("dup")] }], { tools });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("collect gathers static tools + middleware and warns on mcp/setup plugins", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const got = collect([
      { name: "x", tools: [makeTool("t1")] },
      { name: "y", setup: () => undefined }, // 含 setup：build({plugins}) 忽略并告警
    ]);
    expect(got.tools.map((t) => t.name)).toEqual(["t1"]);
    expect(got.middleware).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
