import { describe, expect, it, vi } from "vitest";

import { BailHook, SeriesHook, Stage, WaterfallHook } from "../core/hook";
import { PluginManager } from "../core/manager";
import { CycleError, PhaseError } from "../core/pipeline";
import { definePlugin, type Host } from "../core/plugin";

function makeHooks() {
  return {
    start: new SeriesHook<{ log: string[] }>("start"),
    resolve: new BailHook<{ id: string }, { to: string }>("resolve"),
    transform: new WaterfallHook<{ id: string }, { code: string }>("transform"),
  };
}
type Hooks = ReturnType<typeof makeHooks>;

const host: Host = { cwd: "/tmp" };

describe("PluginManager", () => {
  it("sets up plugins in graph order and dispatches hooks in that order", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    const setups: string[] = [];

    const a = definePlugin<Hooks>({
      name: "a",
      setup(api) {
        setups.push("a");
        api.hooks.start.tap({}, (input) => void input.log.push("a"));
      },
    });
    const b = definePlugin<Hooks>({
      name: "b",
      after: ["a"],
      setup(api) {
        setups.push("b");
        api.hooks.start.tap({}, (input) => void input.log.push("b"));
      },
    });

    await manager.use([b, a]); // 注册顺序故意反着,靠 after 排
    expect(setups).toEqual(["a", "b"]);
    expect(manager.list()).toEqual(["a", "b"]);

    const log: string[] = [];
    await hooks.start.call({ log });
    expect(log).toEqual(["a", "b"]); // tap 默认顺序 = 图序
  });

  it("reflects a later registration in the tap order of an earlier hook", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);

    await manager.use([
      definePlugin<Hooks>({
        name: "late",
        setup: (api) => void api.hooks.start.tap({}, (input) => void input.log.push("late")),
      }),
    ]);
    // 后装配却要求排在前面 —— epoch 变了,已有 tap 的次序自动跟着改。
    await manager.use([
      definePlugin<Hooks>({
        name: "early",
        before: ["late"],
        setup: (api) => void api.hooks.start.tap({}, (input) => void input.log.push("early")),
      }),
    ]);

    const log: string[] = [];
    await hooks.start.call({ log });
    expect(log).toEqual(["early", "late"]);
  });

  it("lets stage override the plugin order inside one hook", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    await manager.use([
      definePlugin<Hooks>({
        name: "a",
        setup: (api) => void api.hooks.start.tap({ stage: Stage.post }, (i) => void i.log.push("a")),
      }),
      definePlugin<Hooks>({
        name: "b",
        after: ["a"],
        setup: (api) => void api.hooks.start.tap({}, (i) => void i.log.push("b")),
      }),
    ]);
    const log: string[] = [];
    await hooks.start.call({ log });
    expect(log).toEqual(["b", "a"]); // stage 先比,图序才是 tiebreak
  });

  it("orders taps per hook, which plugin-level after cannot express", async () => {
    // a 必须在 transform 上先于 b,却要在 resolve 上后于 b —— 插件级 after 是全局的,
    // 表达不了这种反向;tap 级的先后声明是每个 hook 各自一条流水线。
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    const transformed: string[] = [];
    const resolved: string[] = [];

    await manager.use([
      definePlugin<Hooks>({
        name: "a",
        setup(api) {
          api.hooks.transform.tap({ before: ["b"] }, () => void transformed.push("a"));
          api.hooks.resolve.tap({ after: ["b"] }, () => void resolved.push("a"));
        },
      }),
      definePlugin<Hooks>({
        name: "b",
        setup(api) {
          api.hooks.transform.tap({}, () => void transformed.push("b"));
          api.hooks.resolve.tap({}, () => void resolved.push("b"));
        },
      }),
    ]);

    await hooks.transform.call({ id: "x" }, { code: "" });
    await hooks.resolve.call({ id: "x" });
    expect(transformed).toEqual(["a", "b"]);
    expect(resolved).toEqual(["b", "a"]);
  });

  it("rejects a tap-level cycle at the assembly boundary", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    await expect(
      manager.use([
        definePlugin<Hooks>({
          name: "x",
          setup: (api) => void api.hooks.transform.tap({ after: ["y"] }, () => {}),
        }),
        definePlugin<Hooks>({
          name: "y",
          setup: (api) => void api.hooks.transform.tap({ after: ["x"] }, () => {}),
        }),
      ]),
    ).rejects.toThrow(CycleError);
    // 整批回滚:tap 与登记都不留痕。
    expect(manager.list()).toEqual([]);
    expect(hooks.transform.size).toBe(0);
  });

  it("drops a tap-level edge when the referenced plugin unloads", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    const calls: string[] = [];
    await manager.use([
      definePlugin<Hooks>({
        name: "tail",
        setup: (api) => void api.hooks.transform.tap({ after: ["head"] }, () => void calls.push("tail")),
      }),
      definePlugin<Hooks>({
        name: "head",
        setup: (api) => void api.hooks.transform.tap({}, () => void calls.push("head")),
      }),
    ]);
    await hooks.transform.call({ id: "x" }, { code: "" });
    expect(calls).toEqual(["head", "tail"]);

    await manager.unload("head");
    calls.length = 0;
    await hooks.transform.call({ id: "x" }, { code: "" });
    expect(calls).toEqual(["tail"]); // 悬空引用被忽略,不报错
  });

  it("attributes taps to their plugin whatever name is passed", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    await manager.use([
      definePlugin<Hooks>({
        name: "real",
        setup: (api) => void api.hooks.start.tap({ name: "lying" }, () => {}),
      }),
    ]);
    expect(hooks.start.entries().map((entry) => entry.name)).toEqual(["real"]);
  });

  it("applies a declaratively filtered waterfall transform", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    await manager.use([
      definePlugin<Hooks>({
        name: "ts",
        setup(api) {
          api.hooks.transform.tap(
            { filter: { id: /\.ts$/ } },
            (_input, output) => void (output.code += "/*ts*/"),
          );
        },
      }),
    ]);
    expect((await hooks.transform.call({ id: "a.ts" }, { code: "x" })).code).toBe("x/*ts*/");
    expect((await hooks.transform.call({ id: "a.css" }, { code: "x" })).code).toBe("x");
  });

  it("short-circuits a bail hook at the first plugin that answers", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    const seen: string[] = [];
    await manager.use([
      definePlugin<Hooks>({
        name: "alias",
        enforce: "pre",
        setup: (api) =>
          void api.hooks.resolve.tap({ filter: { id: "@/x" } }, () => {
            seen.push("alias");
            return { to: "/abs/x.ts" };
          }),
      }),
      definePlugin<Hooks>({
        name: "fallback",
        setup: (api) =>
          void api.hooks.resolve.tap({}, () => {
            seen.push("fallback");
            return { to: "unresolved" };
          }),
      }),
    ]);
    expect(await hooks.resolve.call({ id: "@/x" })).toEqual({ to: "/abs/x.ts" });
    expect(seen).toEqual(["alias"]);
    expect(await hooks.resolve.call({ id: "other" })).toEqual({ to: "unresolved" });
  });

  it("skips a plugin whose apply returns false", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, { cwd: "/tmp", mode: "serve" });
    const setup = vi.fn();
    await manager.use([
      definePlugin<Hooks>({ name: "build-only", apply: (h) => h.mode === "build", setup }),
    ]);
    expect(setup).not.toHaveBeenCalled();
    expect(manager.list()).toEqual([]);
  });

  it("supports provide / consume across plugins", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    let got: unknown;
    await manager.use([
      definePlugin<Hooks>({
        name: "provider",
        setup: (api) => void api.provide("greet", (name: string) => "hi " + name),
      }),
      definePlugin<Hooks>({
        name: "consumer",
        after: ["provider"],
        setup(api) {
          got = api.consume<(name: string) => string>("greet")?.("x");
        },
      }),
    ]);
    expect(got).toBe("hi x");
  });

  it("sets up one layer concurrently without changing dispatch order", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host, { concurrent: true });
    const setups: string[] = [];
    const plugin = (name: string, delay: number) =>
      definePlugin<Hooks>({
        name,
        setup: async (api) => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          setups.push(name);
          api.hooks.start.tap({}, (input) => void input.log.push(name));
        },
      });

    await manager.use([plugin("slow", 10), plugin("fast", 0)]);
    expect(setups).toEqual(["fast", "slow"]); // 并发:快的先完成
    const log: string[] = [];
    await hooks.start.call({ log });
    expect(log).toEqual(["slow", "fast"]); // 派发仍按图序(注册序)
  });

  it("removes taps and shared values on unload", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    const disposed: string[] = [];
    const off = await manager.use([
      definePlugin<Hooks>({
        name: "p",
        setup(api) {
          api.hooks.start.tap({}, (input) => void input.log.push("p"));
          api.provide("token", 1);
          api.onDispose(() => void disposed.push("p"));
        },
      }),
      definePlugin<Hooks>({
        name: "q",
        after: ["p"],
        setup: (api) => void api.onDispose(() => void disposed.push("q")),
      }),
    ]);
    expect(hooks.start.size).toBe(1);

    await off();
    expect(hooks.start.size).toBe(0);
    expect(disposed).toEqual(["q", "p"]); // 逆序清理
    expect(manager.list()).toEqual([]);
  });

  it("aborts the plugin signal on unload", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    let signal: AbortSignal | undefined;
    await manager.use([
      definePlugin<Hooks>({
        name: "p",
        setup(api) {
          signal = api.signal;
        },
      }),
    ]);
    expect(signal!.aborted).toBe(false);
    await manager.unload("p");
    expect(signal!.aborted).toBe(true);
  });

  it("reloads a single plugin, replacing its taps", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    let round = 0;
    await manager.use([
      definePlugin<Hooks>({
        name: "p",
        setup(api) {
          const mark = "p" + ++round;
          api.hooks.start.tap({}, (input) => void input.log.push(mark));
        },
      }),
    ]);
    expect(await manager.reload("p")).toBe(true);
    expect(hooks.start.size).toBe(1);

    const log: string[] = [];
    await hooks.start.call({ log });
    expect(log).toEqual(["p2"]);
    expect(await manager.reload("nope")).toBe(false);
  });

  it("rolls a failed setup back out of the registry and the graph", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    await expect(
      manager.use([
        definePlugin<Hooks>({
          name: "bad",
          setup(api) {
            api.hooks.start.tap({}, () => {});
            throw new Error("boom");
          },
        }),
      ]),
    ).rejects.toThrow("boom");
    expect(hooks.start.size).toBe(0);
    expect(manager.list()).toEqual([]);
  });

  it("rejects a dependency cycle and leaves the graph untouched", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    await manager.use([definePlugin<Hooks>({ name: "kept", setup() {} })]);
    await expect(
      manager.use([
        definePlugin<Hooks>({ name: "x", after: ["y"], setup() {} }),
        definePlugin<Hooks>({ name: "y", after: ["x"], setup() {} }),
      ]),
    ).rejects.toThrow(CycleError);
    expect(manager.list()).toEqual(["kept"]); // 整批回滚
  });

  it("rejects a dependency that contradicts enforce", async () => {
    const manager = new PluginManager(makeHooks(), host);
    await expect(
      manager.use([
        definePlugin<Hooks>({ name: "late", enforce: "post", setup() {} }),
        definePlugin<Hooks>({ name: "early", enforce: "pre", after: ["late"], setup() {} }),
      ]),
    ).rejects.toThrow(PhaseError);
    expect(manager.list()).toEqual([]);
  });

  it("ignores a duplicate name", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    const setup = vi.fn();
    await manager.use([definePlugin<Hooks>({ name: "p", setup })]);
    await manager.use([definePlugin<Hooks>({ name: "p", setup })]);
    expect(setup).toHaveBeenCalledTimes(1);
  });

  it("passes options through to setup", async () => {
    const manager = new PluginManager(makeHooks(), host);
    let seen: unknown;
    const plugin = definePlugin<Hooks, Host, { level: number }>({
      name: "opt",
      setup(_api, options) {
        seen = options;
      },
    });
    await manager.use([[plugin, { level: 3 }]]);
    expect(seen).toEqual({ level: 3 });
  });

  it("wires a probe onto every hook", async () => {
    const hooks = makeHooks();
    const seen: string[] = [];
    const manager = new PluginManager(hooks, host, {
      probe: (hook, tap) => void seen.push(`${hook}:${tap}`),
    });
    await manager.use([
      definePlugin<Hooks>({
        name: "p",
        setup: (api) => void api.hooks.start.tap({}, () => {}),
      }),
    ]);
    await hooks.start.call({ log: [] });
    expect(seen).toEqual(["start:p"]);
  });

  it("disposes everything", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    await manager.use([
      definePlugin<Hooks>({
        name: "a",
        setup: (api) => void api.hooks.start.tap({}, () => {}),
      }),
      definePlugin<Hooks>({ name: "b", after: ["a"], setup() {} }),
    ]);
    await manager.dispose();
    expect(manager.list()).toEqual([]);
    expect(hooks.start.size).toBe(0);
  });
});
