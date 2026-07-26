import { describe, expect, it } from "vitest";

import { CycleError, PhaseError, Pipeline, type Step } from "../core/pipeline";

const step = (name: string, extra: Partial<Step> = {}): Step => ({
  key: name,
  name,
  bucket: 0,
  ...extra,
});

const names = (pipeline: Pipeline<Step>): string[] => pipeline.plan().order.map((item) => item.name);

function build(...steps: Step[]): Pipeline<Step> {
  const pipeline = new Pipeline<Step>("t");
  pipeline.batch(() => {
    for (const item of steps) pipeline.add(item);
  });
  return pipeline;
}

describe("Pipeline", () => {
  it("keeps registration order when nothing is declared", () => {
    expect(names(build(step("b"), step("a"), step("c")))).toEqual(["b", "a", "c"]);
  });

  it("never builds an edge when nothing is declared", () => {
    const pipeline = build(step("a"), step("b"));
    pipeline.plan();
    expect(pipeline.graph.size).toBe(0);
  });

  it("orders by declaration, then by bucket over declaration", () => {
    expect(names(build(step("b", { after: ["a"] }), step("a")))).toEqual(["a", "b"]);
    // 桶先比:b 声明了要在 a 之后,但两者同桶才轮到那条边说话。
    expect(names(build(step("a", { bucket: 10 }), step("b", { bucket: -10 })))).toEqual(["b", "a"]);
  });

  it("stops counting declarations once the declaring step is removed", () => {
    const pipeline = build(step("a"), step("b", { after: ["a"] }));
    expect(pipeline.plan().order.map((i) => i.name)).toEqual(["a", "b"]);
    expect(pipeline.graph.size).toBe(1);

    pipeline.remove("b");
    pipeline.plan();
    expect(pipeline.graph.size).toBe(0); // 声明数归零,边被清掉
    expect(pipeline.size).toBe(1);
  });

  it("returns the same plan object until something changes", () => {
    const pipeline = build(step("a"), step("b"));
    const plan = pipeline.plan();
    expect(pipeline.plan()).toBe(plan);
    pipeline.add(step("c"));
    expect(pipeline.plan()).not.toBe(plan);
  });

  it("re-sorts on an epoch change without touching the graph", () => {
    const weight = new Map([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
    let epoch = 1;
    const pipeline = new Pipeline<Step>("t", {
      tiebreak: (x, y) => weight.get(x.name)! - weight.get(y.name)!,
      epoch: () => epoch,
    });
    pipeline.add(step("b", { after: ["a"] })); // 有声明 → 确实会连边
    pipeline.add(step("a"));
    pipeline.add(step("c"));

    // a 与 c 都在 0 层(c 谁也不依赖),b 因为那条边落到 1 层。
    const first = pipeline.plan();
    expect(first.order.map((i) => i.name)).toEqual(["a", "c", "b"]);
    const revision = pipeline.graph.revision;

    weight.set("a", 5);
    epoch = 2;
    const second = pipeline.plan();
    expect(second).not.toBe(first); // 重排了
    // 拓扑分析随 shape 缓存:权重变化不重连边、不重编译快照。
    expect(pipeline.graph.revision).toBe(revision);
    // 0 层内 c 现在排在 a 前;b 仍被那条边钉在 1 层,权重动不了它。
    expect(second.order.map((i) => i.name)).toEqual(["c", "a", "b"]);
  });

  it("drops the sort but keeps the analysis on invalidate", () => {
    const pipeline = build(step("a", { after: ["b"] }), step("b"));
    const plan = pipeline.plan();
    const revision = pipeline.graph.revision;
    pipeline.invalidate();
    expect(pipeline.plan()).not.toBe(plan);
    expect(pipeline.graph.revision).toBe(revision);
  });

  it("groups mutually independent steps into one layer", () => {
    const pipeline = build(step("a"), step("b"), step("c", { after: ["a", "b"] }));
    expect(pipeline.plan().layers.map((group) => group.map((i) => i.name))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  it("constrains every step sharing a referenced name", () => {
    const pipeline = build(
      { key: "p#0", name: "p", bucket: 0 },
      { key: "p#1", name: "p", bucket: 0 },
      { key: "last", name: "last", bucket: 0, after: ["p"] },
    );
    expect(pipeline.plan().order.map((i) => i.key)).toEqual(["p#0", "p#1", "last"]);
  });

  it("ignores a reference to a name nobody registered", () => {
    const pipeline = build(step("a", { after: ["ghost"] }));
    expect(() => pipeline.verify()).not.toThrow();
    expect(pipeline.graph.size).toBe(0);
  });

  it("ignores a step referencing its own name", () => {
    const pipeline = build(step("a", { after: ["a"] }));
    expect(() => pipeline.verify()).not.toThrow();
    expect(pipeline.graph.size).toBe(0);
  });

  it("builds one edge for a doubly-declared pair", () => {
    const pipeline = build(step("a", { before: ["b"] }), step("b", { after: ["a"] }));
    pipeline.plan();
    expect(pipeline.graph.size).toBe(1);
  });

  it("reports a cycle and still yields a usable order", () => {
    const pipeline = build(step("x", { after: ["y"] }), step("y", { after: ["x"] }), step("free"));
    expect(() => pipeline.verify()).toThrow(CycleError);
    expect(pipeline.plan().order).toHaveLength(3);
  });

  it("reports a declaration that contradicts the bucket", () => {
    const pipeline = build(step("late", { bucket: 10, before: ["early"] }), step("early", { bucket: -10 }));
    expect(pipeline.plan().cycles).toEqual([]); // 不是环
    expect(() => pipeline.verify()).toThrow(PhaseError);
  });

  it("handles an empty pipeline", () => {
    const pipeline = new Pipeline<Step>("t");
    expect(pipeline.plan().order).toEqual([]);
    expect(pipeline.plan().layers).toEqual([]);
    expect(() => pipeline.verify()).not.toThrow();
  });
});
