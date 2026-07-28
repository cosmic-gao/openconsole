import { describe, expect, it } from "vitest";

import {
  components,
  cuts,
  degrees,
  dominators,
  Invalid,
  isolated,
  kruskal,
  neighborhood,
  Oneway,
  prim,
  reversed,
  scc,
  settle,
  shortestPath,
  shortestPaths,
  sinks,
  Snapshot,
  sources,
  toposort,
  type Structure,
} from "../../index";
import { randomGraph, wedge, weighted } from "../support";

/** 一条 0 → 1 → 2 的链，手写而成，完全不经过 `Graph`。 */
const handmade: Structure = {
  order: 3,
  size: 2,
  outbound: {
    offset: Int32Array.of(0, 1, 2, 2),
    other: Int32Array.of(1, 2),
    edge: Int32Array.of(0, 1),
  },
  inbound: {
    offset: Int32Array.of(0, 0, 1, 2),
    other: Int32Array.of(0, 1),
    edge: Int32Array.of(0, 1),
  },
  weight: Float64Array.of(3, 4),
};

describe("Structure 是算法的唯一契约", () => {
  it("手写的五字段对象可以直接跑全套算法", () => {
    expect([...settle(toposort(handmade))]).toEqual([0, 1, 2]);
    expect(settle(components(handmade)).count).toBe(1);
    expect(settle(scc(handmade)).count).toBe(3);

    const route = settle(shortestPath(handmade, 0, 2))!;
    expect(route.distance).toBe(7);
    expect([...route.path]).toEqual([0, 1, 2]);
  });

  it("reversed 对任意实现都成立，且共享底层数组", () => {
    const back = reversed(handmade);
    expect(back.outbound).toBe(handmade.inbound);
    expect(back.inbound).toBe(handmade.outbound);
    expect([...settle(toposort(back))]).toEqual([2, 1, 0]);
  });

  it("NaN 权在自定义实现上也拦得住", () => {
    const broken: Structure = { ...handmade, weight: Float64Array.of(3, NaN) };
    expect(() => settle(shortestPaths(broken, 0))).toThrow(Invalid);
  });

  it("Snapshot 与等价的裸对象可互换", () => {
    const snapshot = weighted(randomGraph(88, { order: 20, density: 2 }));
    const plain: Structure = {
      order: snapshot.order,
      size: snapshot.size,
      outbound: snapshot.outbound,
      inbound: snapshot.inbound,
      weight: snapshot.weight,
    };

    expect(settle(scc(plain)).count).toBe(settle(scc(snapshot)).count);
    expect([...settle(shortestPaths(plain, 0)).distance]).toEqual([
      ...settle(shortestPaths(snapshot, 0)).distance,
    ]);
  });

  it("同一份 CSR 可换上不同的权重数组，各自享有独立画像", () => {
    const snapshot = weighted(randomGraph(95, { order: 30, density: 3 }));
    const flat = new Float64Array(snapshot.size).fill(1);
    const hops: Structure = { ...snapshot, weight: flat };
    const steep: Structure = {
      ...snapshot,
      weight: Float64Array.from(snapshot.weight!, (w) => w * 100),
    };

    const byCost = settle(shortestPaths(snapshot, 0)).distance;
    const byHops = settle(shortestPaths(hops, 0)).distance;
    const bySteep = settle(shortestPaths(steep, 0)).distance;

    for (let u = 0; u < snapshot.order; u++) {
      expect(bySteep[u]).toBe(byCost[u]! * 100);
      if (byCost[u] !== Infinity) expect(byHops[u]).toBeLessThanOrEqual(byCost[u]!);
    }
    expect([...settle(shortestPaths(snapshot, 0)).distance]).toEqual([
      ...byCost,
    ]);
  });
});

describe("缺入向邻接时明确报错", () => {
  /** `a → c ← b` 只编出向：无向看是一棵树，只看出边就散成两块。 */
  const half = (): Snapshot =>
    Snapshot.of(wedge(), { weight: (weight) => weight ?? 1, outbound: true });

  const needy = [
    ["degrees", (s: Snapshot) => degrees(s)],
    ["sources", (s: Snapshot) => sources(s)],
    ["isolated", (s: Snapshot) => isolated(s)],
    ["components", (s: Snapshot) => settle(components(s))],
    ["cuts", (s: Snapshot) => settle(cuts(s))],
    ["dominators", (s: Snapshot) => settle(dominators(s, 0))],
    ["prim", (s: Snapshot) => settle(prim(s))],
    ["reversed", (s: Snapshot) => reversed(s)],
    ["Snapshot.reverse", (s: Snapshot) => s.reverse()],
    ["predecessors", (s: Snapshot) => neighborhood(s).predecessors(0)],
  ] as const;

  it.each(needy)("%s 抛 Oneway 而不是静默降级", (_label, run) => {
    expect(() => run(half())).toThrow(Oneway);
    expect(() => run(half())).toThrow(/inbound/);
  });

  it("只需出向的接口照常可用", () => {
    const snapshot = half();
    expect([...sinks(snapshot)]).toEqual([2]);
    expect(settle(toposort(snapshot))).toHaveLength(3);
    // kruskal 只扫出向，每条边正好一次，因此不需要入向。
    expect(settle(kruskal(snapshot))).toHaveLength(2);
  });

  it("双向快照上这些接口给出无向视角的答案", () => {
    const snapshot = weighted(wedge());
    expect([...sources(snapshot)]).toEqual([0, 1]);
    expect([...degrees(snapshot).inbound]).toEqual([0, 0, 2]);
    expect(settle(components(snapshot)).count).toBe(1);
    expect([...settle(cuts(snapshot)).articulations]).toEqual([2]);
    expect([...settle(dominators(snapshot, 0))]).toEqual([0, -1, 0]);
    expect(settle(prim(snapshot))).toHaveLength(2);
  });
});
