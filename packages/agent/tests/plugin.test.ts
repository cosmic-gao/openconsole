import { SystemMessage, ToolMessage } from "@langchain/core/messages";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createBus } from "../src/kernel/bus";
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

/** 每个测试用独立 manager + 注册表 + 事件总线，避免污染全局。 */
function isolated() {
  return new PluginManager(new ToolRegistry(), new ModelRegistry(), createBus());
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
    await m.use([
      {
        name: "h",
        setup: (api) =>
          api.hook("system.transform", (_i, o) => {
            o.system += "ctx";
          }),
      },
    ]);
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
          api.hook("system.transform", (_i, o) => {
            o.system += "x";
          });
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

  it("hook('chat.params') merges sampling params into modelSettings", async () => {
    const m = isolated();
    await m.use([
      {
        name: "p",
        setup: (api) =>
          api.hook("chat.params", (_i, o) => {
            o.temperature = 0.1;
            o.topP = 0.9;
          }),
      },
    ]);
    const mw = m.middleware();
    expect(mw?.name).toBe("plugins");
    let seen: { modelSettings?: Record<string, unknown> } | undefined;
    await mw?.wrapModelCall?.(
      {
        systemMessage: new SystemMessage(""),
        state: { messages: [] },
        runtime: {},
        tools: [],
        modelSettings: {},
      } as never,
      ((req: { modelSettings?: Record<string, unknown> }) => {
        seen = req;
        return Promise.resolve({} as never);
      }) as never,
    );
    expect(seen?.modelSettings).toMatchObject({ temperature: 0.1, top_p: 0.9 });
  });

  it("hook('permission.ask') deny short-circuits with an error ToolMessage", async () => {
    const m = isolated();
    await m.use([
      {
        name: "p",
        setup: (api) =>
          api.hook("permission.ask", (i, o) => {
            if (i.tool === "danger") o.status = "deny";
          }),
      },
    ]);
    const mw = m.middleware();
    let called = false;
    const res = (await mw?.wrapToolCall?.(
      { toolCall: { id: "1", name: "danger", args: {} }, runtime: {} } as never,
      (() => {
        called = true;
        return Promise.resolve(
          new ToolMessage({ content: "ran", tool_call_id: "1" }),
        );
      }) as never,
    )) as ToolMessage;
    expect(called).toBe(false);
    expect(res.status).toBe("error");
  });

  it("hook('event') receives published bus events; teardown unsubscribes", async () => {
    const bus = createBus();
    const m = new PluginManager(new ToolRegistry(), new ModelRegistry(), bus);
    const got: string[] = [];
    const off = await m.use([
      {
        name: "p",
        setup: (api) =>
          api.hook("event", (i) => {
            got.push(i.event.type);
          }),
      },
    ]);
    bus.emit("tool_start", { type: "tool_start", id: "1", name: "x", input: {} });
    expect(got).toEqual(["tool_start"]);
    await off();
    bus.emit("tool_start", { type: "tool_start", id: "2", name: "y", input: {} });
    expect(got).toEqual(["tool_start"]); // teardown 后不再收到
  });
});
