import { describe, expect, it } from "vitest";

import { type OrderNode, CycleError, PluginGraph } from "../core/ordering";

const defs: OrderNode[] = [
  { name: "alias", enforce: "pre" },
  { name: "virtual" },
  { name: "inject", pre: ["virtual"] },
  { name: "react" },
  { name: "minify", enforce: "post" },
  { name: "report", enforce: "post", pre: ["minify"] },
];

function build(): PluginGraph {
  const pg = new PluginGraph();
  pg.batch(() => {
    for (const def of defs) pg.add(def);
    for (const def of defs) pg.linkDeps(def);
  });
  return pg;
}

describe("PluginGraph", () => {
  it("orders by enforce phase, then dependency", () => {
    const pg = build();
    const codes = pg.codes();
    const seq = (name: string): number => codes.get(name)!.sequence;

    expect(seq("alias")).toBeLessThan(seq("virtual")); // pre 相最前
    expect(seq("alias")).toBeLessThan(seq("react"));
    expect(seq("virtual")).toBeLessThan(seq("inject")); // 依赖序
    expect(seq("minify")).toBeLessThan(seq("report"));
    expect(seq("react")).toBeLessThan(seq("minify")); // 默认相在 post 相之前
    expect(seq("inject")).toBeLessThan(seq("minify"));

    pg.dispose();
  });

  it("computes bucket and layer", () => {
    const pg = build();
    const codes = pg.codes();
    expect(codes.get("alias")!.bucket).toBe(0);
    expect(codes.get("virtual")!.bucket).toBe(1);
    expect(codes.get("minify")!.bucket).toBe(2);
    expect(codes.get("virtual")!.layer).toBe(0);
    expect(codes.get("inject")!.layer).toBe(1); // 依赖 virtual → 深一层
    pg.dispose();
  });

  it("maintains order incrementally when a plugin is added", () => {
    const pg = build();
    pg.add({ name: "fast-refresh", pre: ["react"] });
    pg.linkDeps({ name: "fast-refresh", pre: ["react"] });
    const codes = pg.codes();
    expect(codes.get("fast-refresh")!.sequence).toBeGreaterThan(codes.get("react")!.sequence);
    pg.dispose();
  });

  it("detects cycles via scc", () => {
    const pg = new PluginGraph();
    pg.batch(() => {
      pg.add({ name: "x", pre: ["y"] });
      pg.add({ name: "y", pre: ["x"] });
      pg.linkDeps({ name: "x", pre: ["y"] });
      pg.linkDeps({ name: "y", pre: ["x"] });
    });
    expect(pg.hasCycle).toBe(true);
    expect(() => pg.codes()).toThrow(CycleError);
    pg.dispose();
  });
});
