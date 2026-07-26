/**
 * 端到端:用四种 hook 拼一条 mini-bundler 流水线,验证 README 快速开始那套 API 确实自洽。
 */

import { describe, expect, it } from "vitest";

import { BailHook, ParallelHook, SeriesHook, Stage, WaterfallHook } from "../core/hook";
import { PluginManager } from "../core/manager";
import { definePlugin, type Host } from "../core/plugin";

function createBuildHooks() {
  return {
    buildStart: new SeriesHook<{ root: string }>("buildStart"),
    resolveId: new BailHook<{ id: string; importer?: string }, { id: string }>("resolveId"),
    load: new BailHook<{ id: string; namespace?: string }, { code: string }>("load"),
    transform: new WaterfallHook<{ id: string }, { code: string }>("transform"),
    buildEnd: new ParallelHook<{ durationMs: number }>("buildEnd"),
  };
}
type BuildHooks = ReturnType<typeof createBuildHooks>;

const alias = definePlugin<BuildHooks, Host, { entries: Record<string, string> }>({
  name: "alias",
  enforce: "pre",
  setup(api, options) {
    api.hooks.resolveId.tap({ filter: { id: Object.keys(options.entries) } }, ({ id }) => ({
      id: options.entries[id]!,
    }));
  },
});

const virtual = definePlugin<BuildHooks>({
  name: "virtual",
  setup(api) {
    api.hooks.load.tap({ filter: { namespace: "virtual" } }, ({ id }) => ({
      code: `export default ${JSON.stringify(id)};`,
    }));
  },
});

const banner = definePlugin<BuildHooks>({
  name: "banner",
  setup(api) {
    api.hooks.transform.tap(
      { filter: { id: /\.[jt]sx?$/ } },
      (_input, output) => void (output.code = `/* built */\n${output.code}`),
    );
  },
});

const stripDebugger = definePlugin<BuildHooks>({
  name: "strip-debugger",
  enforce: "post",
  setup(api) {
    api.hooks.transform.tap(
      { filter: { id: /\.[jt]sx?$/ }, stage: Stage.post },
      (_input, output) => void (output.code = output.code.replace(/\bdebugger;?/g, "")),
    );
  },
});

describe("mini-bundler pipeline", () => {
  it("resolves, loads, and transforms through the whole plugin set", async () => {
    const hooks = createBuildHooks();
    const manager = new PluginManager(hooks, { cwd: "/repo", mode: "build" });
    const started: string[] = [];
    const finished: number[] = [];

    await manager.use([
      [alias, { entries: { "@/x": "/abs/x.ts" } }],
      virtual,
      banner,
      stripDebugger,
      definePlugin<BuildHooks>({
        name: "reporter",
        setup(api) {
          api.hooks.buildStart.tap({}, ({ root }) => void started.push(root));
          api.hooks.buildEnd.tap({}, ({ durationMs }) => void finished.push(durationMs));
        },
      }),
    ]);

    await hooks.buildStart.call({ root: "/repo" });
    expect(started).toEqual(["/repo"]);

    const resolved = await hooks.resolveId.call({ id: "@/x" });
    expect(resolved).toEqual({ id: "/abs/x.ts" });
    expect(await hooks.resolveId.call({ id: "./untouched" })).toBeUndefined();

    const loaded = await hooks.load.call({ id: "@/env", namespace: "virtual" });
    expect(loaded).toEqual({ code: 'export default "@/env";' });
    expect(await hooks.load.call({ id: "/abs/x.ts" })).toBeUndefined();

    const out = await hooks.transform.call({ id: resolved!.id }, { code: "debugger; run();" });
    expect(out.code).toBe("/* built */\n run();");

    // 非 ts / js 的 id 一个 tap 都不命中。
    expect((await hooks.transform.call({ id: "a.css" }, { code: "debugger;" })).code).toBe("debugger;");

    await hooks.buildEnd.call({ durationMs: 42 });
    expect(finished).toEqual([42]);
  });

  it("places every plugin in the phase its enforce asks for", async () => {
    const manager = new PluginManager(createBuildHooks(), { cwd: "/repo" });
    await manager.use([stripDebugger, virtual, [alias, { entries: {} }], banner]);

    const codes = manager.codes();
    expect(codes.get("alias")!.bucket).toBe(0);
    expect(codes.get("virtual")!.bucket).toBe(1);
    expect(codes.get("strip-debugger")!.bucket).toBe(2);
    expect(manager.list()).toEqual(["alias", "virtual", "banner", "strip-debugger"]);
  });

  it("unloads one plugin without disturbing the rest", async () => {
    const hooks = createBuildHooks();
    const manager = new PluginManager(hooks, { cwd: "/repo" });
    await manager.use([banner, stripDebugger]);
    expect(hooks.transform.size).toBe(2);

    await manager.unload("banner");
    expect(hooks.transform.entries().map((entry) => entry.name)).toEqual(["strip-debugger"]);
    expect((await hooks.transform.call({ id: "a.ts" }, { code: "debugger; ok();" })).code).toBe(" ok();");
  });
});
