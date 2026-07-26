import { describe, expect, it } from "vitest";

import { Ordering, type Ordered } from "../core/order";
import { CycleError, PhaseError } from "../core/pipeline";

const defs: Ordered[] = [
  { name: "alias", enforce: "pre" },
  { name: "virtual" },
  { name: "inject", after: ["virtual"] },
  { name: "react" },
  { name: "minify", enforce: "post" },
  { name: "report", enforce: "post", after: ["minify"] },
];

/** 抓住抛出的错误 —— 比 try/catch 里塞断言可靠:不抛就是 undefined,断言照样失败。 */
function grab(work: () => void): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  return undefined;
}

function build(nodes: Ordered[] = defs): Ordering {
  const order = new Ordering();
  order.batch(() => {
    for (const node of nodes) order.add(node);
  });
  return order;
}

describe("Ordering", () => {
  it("orders by enforce phase, then dependency", () => {
    const codes = build().codes();
    const seq = (name: string): number => codes.get(name)!.sequence;

    expect(seq("alias")).toBeLessThan(seq("virtual")); // pre 相最前
    expect(seq("alias")).toBeLessThan(seq("react"));
    expect(seq("virtual")).toBeLessThan(seq("inject")); // 依赖序
    expect(seq("minify")).toBeLessThan(seq("report"));
    expect(seq("react")).toBeLessThan(seq("minify")); // 默认相在 post 相之前
    expect(seq("inject")).toBeLessThan(seq("minify"));
  });

  it("computes bucket and layer", () => {
    const codes = build().codes();
    expect(codes.get("alias")!.bucket).toBe(0);
    expect(codes.get("virtual")!.bucket).toBe(1);
    expect(codes.get("minify")!.bucket).toBe(2);
    expect(codes.get("virtual")!.layer).toBe(0);
    expect(codes.get("inject")!.layer).toBe(1); // 依赖 virtual → 深一层
    expect(codes.get("virtual")!.code).toMatch(/^1\.\d{3}$/);
  });

  it("reads before / after as two spellings of one edge", () => {
    const order = build([{ name: "a", before: ["b"] }, { name: "b", after: ["a"] }, { name: "c" }]);
    const codes = order.codes();
    expect(codes.get("a")!.sequence).toBeLessThan(codes.get("b")!.sequence);
    expect(order.graph.size).toBe(1); // 两侧各声明一次,只建一条边
  });

  it("ignores dependencies on unregistered names", () => {
    const order = build([{ name: "a", after: ["nope"] }]);
    expect(() => order.verify()).not.toThrow();
    expect(order.sorted()).toEqual(["a"]);
  });

  it("groups mutually independent plugins into one layer", () => {
    const order = build([
      { name: "a" },
      { name: "b" },
      { name: "c", after: ["a", "b"] },
      { name: "early", enforce: "pre" },
    ]);
    expect(order.layers().map((layer) => [...layer])).toEqual([["early"], ["a", "b"], ["c"]]);
  });

  it("keeps sequence contiguous within each layer", () => {
    const order = build();
    const codes = order.codes();
    let at = 0;
    for (const layer of order.layers()) {
      for (const name of layer) expect(codes.get(name)!.sequence).toBe(at++);
    }
  });

  it("recomputes after add and remove", () => {
    const order = build();
    const before = order.epoch;

    order.add({ name: "fast-refresh", after: ["react"] });
    expect(order.epoch).not.toBe(before);
    const codes = order.codes();
    expect(codes.get("fast-refresh")!.sequence).toBeGreaterThan(codes.get("react")!.sequence);

    order.remove("react");
    expect(order.has("react")).toBe(false);
    expect(order.codes().has("react")).toBe(false);
    expect(() => order.verify()).not.toThrow();
  });

  it("caches the resolved view until the graph changes", () => {
    const order = build();
    expect(order.codes()).toBe(order.codes());
    order.remove("react");
    expect(order.codes().size).toBe(defs.length - 1);
  });

  it("reports cycles as strongly connected components", () => {
    const order = build([
      { name: "x", after: ["y"] },
      { name: "y", after: ["x"] },
      { name: "loner" },
    ]);
    const error = grab(() => order.verify());
    expect(error).toBeInstanceOf(CycleError);
    expect((error as CycleError).components).toEqual([expect.arrayContaining(["x", "y"])]);
    // 带环时顺序降级但不崩塌 —— 每个插件仍有一个权重。
    expect(order.weight("loner")).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it("names a phase conflict instead of disguising it as a cycle", () => {
    const order = build([
      { name: "late", enforce: "post" },
      { name: "early", enforce: "pre", after: ["late"] },
    ]);
    const error = grab(() => order.verify());
    expect(error).toBeInstanceOf(PhaseError); // 不是 CycleError
    expect((error as PhaseError).conflicts).toEqual([
      { from: "late", to: "early", fromBucket: 2, toBucket: 0 },
    ]);
    expect((error as PhaseError).message).toContain("late(post 相) 须先于 early(pre 相)");
  });

  it("gives an unknown name the last weight", () => {
    expect(build().weight("nope")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("handles an empty graph", () => {
    const order = new Ordering();
    expect(order.sorted()).toEqual([]);
    expect(order.layers()).toEqual([]);
    expect(() => order.verify()).not.toThrow();
  });
});
