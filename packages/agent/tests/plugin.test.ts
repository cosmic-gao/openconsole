import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ModelRegistry } from "../src/kernel/model";
import { PluginManager, plugins, type Plugin } from "../src/kernel/plugin";
import { ToolRegistry } from "../src/kernel/registry";
import { Tool } from "../src/capabilities/tool";
import { ok, type AgentSpec } from "../src/types";

function makeTool(name: string) {
  return Tool.define({
    name,
    description: "test tool",
    schema: z.object({}),
    execute: () => ok("ok"),
  });
}

function makeSpec(): AgentSpec {
  return { modelId: "openai:gpt-4o-mini", tools: {}, prompt: "base" };
}

/** 每个测试用独立 manager + 注册表，避免污染全局。 */
function isolated() {
  return new PluginManager(new ToolRegistry(), new ModelRegistry());
}

describe("plugin (rsbuild-style)", () => {
  it("setup(api) contributes tools and models", async () => {
    const tools = new ToolRegistry();
    const models = new ModelRegistry();
    const m = new PluginManager(tools, models);
    const p: Plugin = {
      name: "demo",
      setup(api) {
        api.addTool(makeTool("echo"));
        api.addModel("fast_llm", "openai:gpt-4o-mini");
      },
    };
    await m.use([p]);
    expect(tools.has("echo")).toBe(true);
    expect(models.has("fast_llm")).toBe(true);
    expect(plugins.has("demo")).toBe(true);
  });

  it("modifySpec chains by order (pre → default → post)", async () => {
    const m = isolated();
    const p: Plugin = {
      name: "spec",
      setup(api) {
        api.modifySpec((s) => ({ ...s, prompt: `${s.prompt} A` }), {
          order: "post",
        });
        api.modifySpec((s) => ({ ...s, prompt: `${s.prompt} B` }), {
          order: "pre",
        });
        api.modifySpec((s) => ({ ...s, prompt: `${s.prompt} C` }));
      },
    };
    await m.use([p]);
    expect(m.applySpec(makeSpec()).prompt).toBe("base B C A"); // pre→default→post
  });

  it("compiles runtime hooks into a 'plugins' middleware (undefined when none)", async () => {
    expect(isolated().middleware()).toBeUndefined();
    const m = isolated();
    await m.use([{ name: "h", setup: (api) => api.modifyPrompt(() => "ctx") }]);
    expect(m.middleware()?.name).toBe("plugins");
  });

  it("topo-sorts plugins by pre/post (even when passed out of order)", async () => {
    const m = isolated();
    const seen: string[] = [];
    const provider: Plugin = {
      name: "provider",
      setup: () => {
        seen.push("provider");
      },
    };
    const consumer: Plugin = {
      name: "consumer",
      pre: ["provider"], // provider 须在 consumer 之前
      setup: () => {
        seen.push("consumer");
      },
    };
    await m.use([consumer, provider]); // 故意逆序传入
    expect(seen).toEqual(["provider", "consumer"]);
  });

  it("expose/useExposed shares values across plugins", async () => {
    const m = isolated();
    let got: number | undefined;
    const provider: Plugin = {
      name: "p1",
      setup: (api) => api.expose("answer", 42),
    };
    const consumer: Plugin = {
      name: "p2",
      pre: ["p1"],
      setup: (api) => {
        got = api.useExposed<number>("answer");
      },
    };
    await m.use([provider, consumer]);
    expect(got).toBe(42);
  });

  it("teardown removes hooks and exposed values", async () => {
    const m = isolated();
    const off = await m.use([
      {
        name: "t",
        setup: (api) => {
          api.modifyPrompt(() => "x");
          api.expose("k", 1);
        },
      },
    ]);
    expect(m.middleware()).toBeDefined();
    await off();
    expect(m.middleware()).toBeUndefined();
  });

  it("warns when a plugin tool overrides an existing name", async () => {
    const tools = new ToolRegistry();
    tools.register(makeTool("dup"));
    const m = new PluginManager(tools, new ModelRegistry());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await m.use([{ name: "p", setup: (api) => api.addTool(makeTool("dup")) }]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
