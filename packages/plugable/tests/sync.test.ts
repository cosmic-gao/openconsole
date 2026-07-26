import { describe, expect, it, vi } from "vitest";

import {
  HookMap,
  Stage,
  SyncBailHook,
  SyncSeriesHook,
  SyncWaterfallHook,
  type SyncProduce,
} from "../core/hook";
import { PluginManager } from "../core/manager";
import { definePlugin, type Host } from "../core/plugin";

const host: Host = { cwd: "/tmp" };

describe("SyncSeriesHook", () => {
  it("returns without a promise", () => {
    const calls: string[] = [];
    const hook = new SyncSeriesHook<void>("s");
    hook.tap({ name: "a" }, () => void calls.push("a"));
    hook.tap({ name: "b" }, () => void calls.push("b"));
    expect(hook.call(undefined)).toBeUndefined(); // 不是 Promise
    expect(calls).toEqual(["a", "b"]);
  });

  it("honours stage, before / after and filter like the async hooks", () => {
    const calls: string[] = [];
    const hook = new SyncSeriesHook<{ id: string }>("s");
    hook.tap({ name: "last", stage: Stage.post }, () => void calls.push("last"));
    hook.tap({ name: "b", after: ["a"] }, () => void calls.push("b"));
    hook.tap({ name: "a" }, () => void calls.push("a"));
    hook.tap({ name: "css", filter: { id: /\.css$/ } }, () => void calls.push("css"));
    hook.call({ id: "x.ts" });
    expect(calls).toEqual(["a", "b", "last"]);
  });

  it("names the tap that wrongly returned a promise", () => {
    const hook = new SyncSeriesHook<void>("s");
    // 类型上挡不住:返回 void 的位置接受任何返回值。
    hook.tap({ name: "oops" }, (() => Promise.resolve()) as () => void);
    expect(() => hook.call(undefined)).toThrow('tap "oops" 却返回了 Promise');
  });

  it("isolates errors when onError is provided", () => {
    const seen: string[] = [];
    const hook = new SyncSeriesHook<void>("s", { onError: (_e, tap) => void seen.push(tap) });
    hook.tap({ name: "bad" }, () => {
      throw new Error("boom");
    });
    hook.tap({ name: "ok" }, () => void seen.push("ok"));
    hook.call(undefined);
    expect(seen).toEqual(["bad", "ok"]);
  });
});

describe("SyncWaterfallHook", () => {
  it("threads output through in-place mutation and replacement", () => {
    const hook = new SyncWaterfallHook<void, { code: string }>("t");
    hook.tap({ name: "a" }, (_input, output) => void (output.code += "A"));
    hook.tap({ name: "b" }, (_input, output) => ({ code: output.code + "B" }));
    expect(hook.call(undefined, { code: "" })).toEqual({ code: "AB" });
  });

  it("uses immutable snapshots when a produce is injected", () => {
    const produce: SyncProduce<{ code: string }> = (base, recipe) => {
      const draft = { ...base };
      return recipe(draft) ?? draft;
    };
    const hook = new SyncWaterfallHook<void, { code: string }>("t", { produce });
    const input = { code: "" };
    hook.tap({ name: "a" }, (_input, output) => void (output.code += "A"));
    expect(hook.call(undefined, input).code).toBe("A");
    expect(input.code).toBe("");
  });
});

describe("SyncBailHook", () => {
  it("returns the first non-null result and short-circuits", () => {
    const seen: string[] = [];
    const hook = new SyncBailHook<{ id: string }, string>("r");
    hook.tap({ name: "miss" }, () => {
      seen.push("miss");
      return undefined;
    });
    hook.tap({ name: "hit" }, () => {
      seen.push("hit");
      return "answer";
    });
    hook.tap({ name: "never" }, () => {
      seen.push("never");
      return "other";
    });
    expect(hook.call({ id: "x" })).toBe("answer");
    expect(seen).toEqual(["miss", "hit"]);
  });

  it("returns undefined when nobody answers", () => {
    const hook = new SyncBailHook<void, string>("r");
    hook.tap({ name: "a" }, () => undefined);
    expect(hook.call(undefined)).toBeUndefined();
  });
});

describe("HookMap", () => {
  it("derives a hook per key, lazily", () => {
    const made: string[] = [];
    const map = new HookMap((key) => {
      made.push(key);
      return new SyncSeriesHook<string[]>(`event:${key}`);
    });
    expect(map.size).toBe(0);

    map.for("build").tap({ name: "a" }, (log) => void log.push("build:a"));
    map.for("serve").tap({ name: "b" }, (log) => void log.push("serve:b"));
    expect(map.for("build")).toBe(map.for("build")); // 同 key 同实例
    expect(made).toEqual(["build", "serve"]);
    expect([...map.keys()]).toEqual(["build", "serve"]);

    const log: string[] = [];
    map.for("build").call(log);
    expect(log).toEqual(["build:a"]); // 只跑这个 key 的 tap
  });

  it("propagates ranking and probe to keys made before and after wiring", () => {
    const seen: string[] = [];
    const map = new HookMap((key) => new SyncSeriesHook<void>(key));
    map.for("early").tap({ name: "p" }, () => {});

    map.probe = (hook, tap) => void seen.push(`${hook}:${tap}`);
    map.weigh({ epoch: 1, weight: () => 0 });
    map.for("late").tap({ name: "q" }, () => {});

    map.for("early").call(undefined);
    map.for("late").call(undefined);
    expect(seen).toEqual(["early:p", "late:q"]);
    expect(map.probe).toBeDefined();
  });

  it("verifies every derived hook", () => {
    const map = new HookMap((key) => new SyncSeriesHook<void>(key));
    map.for("bad").tap({ name: "x", after: ["y"] }, () => {});
    map.for("bad").tap({ name: "y", after: ["x"] }, () => {});
    expect(() => map.verify()).toThrow('hook "bad" 的 tap 顺序成环');
  });
});

describe("HookMap through the manager", () => {
  function makeHooks() {
    return {
      run: new SyncSeriesHook<{ log: string[] }>("run"),
      command: new HookMap((key) => new SyncBailHook<{ args: string[] }, string>(`command:${key}`)),
    };
  }
  type Hooks = ReturnType<typeof makeHooks>;

  it("lets plugins register per key and attributes taps to them", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);

    await manager.use([
      definePlugin<Hooks>({
        name: "builder",
        setup(api) {
          api.hooks.command.for("build").tap({}, ({ args }) => `built ${args.join(",")}`);
          api.hooks.run.tap({}, ({ log }) => void log.push("builder"));
        },
      }),
      definePlugin<Hooks>({
        name: "server",
        after: ["builder"],
        setup(api) {
          api.hooks.command.for("serve").tap({}, () => "served");
        },
      }),
    ]);

    expect(hooks.command.for("build").call({ args: ["x"] })).toBe("built x");
    expect(hooks.command.for("serve").call({ args: [] })).toBe("served");
    expect(hooks.command.for("build").entries().map((e) => e.name)).toEqual(["builder"]);
    expect(hooks.command.for("nobody").call({ args: [] })).toBeUndefined();
  });

  it("un-taps derived hooks on unload", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    await manager.use([
      definePlugin<Hooks>({
        name: "p",
        setup: (api) => void api.hooks.command.for("build").tap({}, () => "yes"),
      }),
    ]);
    expect(hooks.command.for("build").size).toBe(1);

    await manager.unload("p");
    expect(hooks.command.for("build").size).toBe(0);
    expect(hooks.command.for("build").call({ args: [] })).toBeUndefined();
  });

  it("wires a manager probe into keys derived later", async () => {
    const seen: string[] = [];
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host, {
      probe: (hook, tap) => void seen.push(`${hook}:${tap}`),
    });
    await manager.use([
      definePlugin<Hooks>({
        name: "p",
        setup: (api) => void api.hooks.command.for("build").tap({}, () => "yes"),
      }),
    ]);
    hooks.command.for("build").call({ args: [] });
    expect(seen).toEqual(["command:build:p"]);
  });

  it("orders per-key taps by the plugin graph", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    const calls: string[] = [];
    const plugin = (name: string, extra: { before?: string[] } = {}) =>
      definePlugin<Hooks>({
        name,
        ...extra,
        setup: (api) =>
          void api.hooks.command.for("build").tap({}, () => {
            calls.push(name);
            return undefined;
          }),
      });

    await manager.use([plugin("second"), plugin("first", { before: ["second"] })]);
    hooks.command.for("build").call({ args: [] });
    expect(calls).toEqual(["first", "second"]);
  });

  it("rejects a tap cycle inside a derived hook at the assembly boundary", async () => {
    const hooks = makeHooks();
    const manager = new PluginManager(hooks, host);
    const spy = vi.fn();
    await expect(
      manager.use([
        definePlugin<Hooks>({
          name: "x",
          setup: (api) => void api.hooks.command.for("build").tap({ after: ["y"] }, spy),
        }),
        definePlugin<Hooks>({
          name: "y",
          setup: (api) => void api.hooks.command.for("build").tap({ after: ["x"] }, spy),
        }),
      ]),
    ).rejects.toThrow('hook "command:build" 的 tap 顺序成环');
    expect(manager.list()).toEqual([]);
    expect(hooks.command.for("build").size).toBe(0);
  });
});
