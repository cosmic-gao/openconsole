import { describe, expect, it } from "vitest";

import { SeriesHook, WaterfallHook } from "../core/hook";
import { PluginManager } from "../core/manager";
import { definePlugin, type HostContext } from "../core/plugin";

function makeHooks() {
  return {
    start: new SeriesHook<{ log: string[] }>("start"),
    transform: new WaterfallHook<{ id: string }, { code: string }>("transform"),
  };
}
type Hooks = ReturnType<typeof makeHooks>;

const context: HostContext = { cwd: "/tmp" };

describe("PluginManager", () => {
  it("sets up plugins in graph order and dispatches hooks in that order", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, context);
    const setupOrder: string[] = [];

    const a = definePlugin<Hooks>({
      name: "a",
      setup(api) {
        setupOrder.push("a");
        api.hooks.start.tap(api.name, (input) => void input.log.push("a"));
      },
    });
    const b = definePlugin<Hooks>({
      name: "b",
      pre: ["a"], // a 必须先于 b
      setup(api) {
        setupOrder.push("b");
        api.hooks.start.tap(api.name, (input) => void input.log.push("b"));
      },
    });

    await manager.use([b, a]); // 注册顺序故意反着,靠 pre 排
    expect(setupOrder).toEqual(["a", "b"]);

    const log: string[] = [];
    await hooks.start.call({ log });
    expect(log).toEqual(["a", "b"]); // tap 默认顺序 = 图序
  });

  it("applies a filtered waterfall transform", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, context);
    await manager.use([
      definePlugin<Hooks>({
        name: "ts",
        setup(api) {
          api.hooks.transform.tap(
            { name: api.name, filter: (input) => input.id.endsWith(".ts") },
            (_input, output) => void (output.code += "/*ts*/"),
          );
        },
      }),
    ]);
    expect((await hooks.transform.call({ id: "a.ts" }, { code: "x" })).code).toBe("x/*ts*/");
    expect((await hooks.transform.call({ id: "a.css" }, { code: "x" })).code).toBe("x");
  });

  it("supports expose / useExposed across plugins", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, context);
    let got: unknown;
    await manager.use([
      definePlugin<Hooks>({
        name: "provider",
        setup(api) {
          api.expose("greet", (name: string) => "hi " + name);
        },
      }),
      definePlugin<Hooks>({
        name: "consumer",
        pre: ["provider"], // provider 必须先 setup
        setup(api) {
          const greet = api.useExposed<(name: string) => string>("greet");
          got = greet?.("x");
        },
      }),
    ]);
    expect(got).toBe("hi x");
  });

  it("removes taps on unload", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, context);
    const off = await manager.use([
      definePlugin<Hooks>({
        name: "p",
        setup(api) {
          api.hooks.start.tap(api.name, (input) => void input.log.push("p"));
        },
      }),
    ]);
    expect(hooks.start.size).toBe(1);
    await off();
    expect(hooks.start.size).toBe(0);
  });

  it("rejects on a dependency cycle", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, context);
    await expect(
      manager.use([
        definePlugin<Hooks>({ name: "x", pre: ["y"], setup() {} }),
        definePlugin<Hooks>({ name: "y", pre: ["x"], setup() {} }),
      ]),
    ).rejects.toThrow();
  });
});
