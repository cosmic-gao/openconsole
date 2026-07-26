import { describe, expect, it } from "vitest";

import {
  components,
  Graph,
  graphId,
  merged,
  nodeId,
  reversed,
  scc,
  settle,
  shortestPath,
  shortestPaths,
  Snapshot,
  toposort,
  type Structure,
} from "../index";
import { randomGraph, vertex } from "./random";

const cost = (weight: number | undefined): number => weight ?? 1;

/** 一条 0 → 1 → 2 的链，手写而成，完全不经过 `Graph`。 */
const chain: Structure = {
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
    expect([...settle(toposort(chain))]).toEqual([0, 1, 2]);
    expect(settle(components(chain)).count).toBe(1);
    expect(settle(scc(chain)).count).toBe(3);

    const route = settle(shortestPath(chain, 0, 2))!;
    expect(route.distance).toBe(7);
    expect([...route.path]).toEqual([0, 1, 2]);
  });

  it("reversed 对任意实现都成立，且共享底层数组", () => {
    const back = reversed(chain);
    expect(back.outbound).toBe(chain.inbound);
    expect(back.inbound).toBe(chain.outbound);
    expect([...settle(toposort(back))]).toEqual([2, 1, 0]);
  });

  it("无入向的实现上 reversed 明确报错而不是给出错误答案", () => {
    const forwardOnly: Structure = { ...chain, inbound: undefined };
    expect(() => reversed(forwardOnly)).toThrow(/inbound/);
    expect([...settle(toposort(forwardOnly))]).toEqual([0, 1, 2]);
  });

  it("Snapshot 本身就是一个 Structure，两者可互换", () => {
    const graph = randomGraph(88, { order: 20, density: 2 });
    const snapshot = Snapshot.of(graph, { weight: cost });
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
});

describe("增量重编译", () => {
  const build = (): Graph<number, number> =>
    randomGraph(89, { order: 200, density: 3 });

  it("什么都没变时原样返回同一个快照", () => {
    const graph = build();
    const base = Snapshot.of(graph, { weight: cost });
    expect(Snapshot.of(graph, { weight: cost, reuse: base })).toBe(base);
  });

  it("只动权重时复用 CSR，只重算权重数组", () => {
    const graph = build();
    const base = Snapshot.of(graph, { weight: cost });
    const edge = graph.edges()[0]!;
    graph.setEdgeWeight(edge, 999);

    const next = Snapshot.of(graph, { weight: cost, reuse: base });
    expect(next).not.toBe(base);
    expect(next.outbound).toBe(base.outbound);
    expect(next.inbound).toBe(base.inbound);
    expect(next.labels).toBe(base.labels);
    expect(next.edges).toBe(base.edges);
    expect(next.weight).not.toBe(base.weight);
    expect(next.current).toBe(true);

    const at = base.edges.indexOf(edge);
    expect(next.weight![at]).toBe(999);
    // 与全量编译逐位一致。
    expect([...next.weight!]).toEqual([
      ...Snapshot.of(graph, { weight: cost }).weight!,
    ]);
  });

  it("复用出来的快照用的是新权重，不吃旧的边权画像缓存", () => {
    const graph = new Graph<number, number>(graphId("reweigh"));
    for (const name of ["a", "b", "c"]) graph.addNode(vertex(name, 0));
    graph.connect([nodeId("a"), "out"], [nodeId("b"), "in"], { weight: 1 });
    const long = graph.connect([nodeId("b"), "out"], [nodeId("c"), "in"], {
      weight: 1,
    });
    graph.connect([nodeId("a"), "out"], [nodeId("c"), "in"], { weight: 5 });

    const base = Snapshot.of(graph, { weight: cost });
    expect(settle(shortestPath(base, 0, 2))!.distance).toBe(2);

    graph.setEdgeWeight(long, 100);
    const next = Snapshot.of(graph, { weight: cost, reuse: base });
    expect(settle(shortestPath(next, 0, 2))!.distance).toBe(5);
  });

  it("结构一变就退回全量编译", () => {
    const graph = build();
    const base = Snapshot.of(graph, { weight: cost });
    graph.addNode(vertex("extra", 0));

    const next = Snapshot.of(graph, { weight: cost, reuse: base });
    expect(next.outbound).not.toBe(base.outbound);
    expect(next.order).toBe(base.order + 1);
  });

  it("带谓词或换了编译选项时不复用", () => {
    const graph = build();
    const base = Snapshot.of(graph, { weight: cost });
    graph.setEdgeWeight(graph.edges()[0]!, 2);

    const filtered = Snapshot.of(graph, {
      weight: cost,
      reuse: base,
      node: () => true,
    });
    expect(filtered.outbound).not.toBe(base.outbound);

    const undirected = Snapshot.of(graph, {
      weight: cost,
      reuse: base,
      undirected: true,
    });
    expect(undirected.outbound).not.toBe(base.outbound);
    expect(merged(undirected)).toBe(true);
  });

  it("翻转过的快照不会被复用成反向结构", () => {
    const graph = build();
    const base = Snapshot.of(graph, { weight: cost });
    const flipped = base.reverse();
    graph.setEdgeWeight(graph.edges()[0]!, 7);

    const next = Snapshot.of(graph, { weight: cost, reuse: flipped });
    expect(next.outbound).not.toBe(flipped.outbound);
    expect([...next.outbound.offset]).toEqual([...base.outbound.offset]);
    expect([...next.outbound.other]).toEqual([...base.outbound.other]);
  });

  it("传别的图的快照当 reuse 不会串味", () => {
    const graph = build();
    const other = randomGraph(90, { order: 30, density: 2 });
    const stranger = Snapshot.of(other, { weight: cost });

    const next = Snapshot.of(graph, { weight: cost, reuse: stranger });
    expect(next.order).toBe(graph.order);
    expect(next.outbound).not.toBe(stranger.outbound);
  });

  it("增量重编译显著快过全量编译", () => {
    const graph = randomGraph(91, { order: 3000, density: 6 });
    const base = Snapshot.of(graph, { weight: cost });
    const edge = graph.edges()[0]!;

    const time = (work: () => void): number => {
      for (let i = 0; i < 3; i++) work();
      const started = performance.now();
      for (let i = 0; i < 10; i++) work();
      return (performance.now() - started) / 10;
    };

    let tick = 0;
    const full = time(() => void Snapshot.of(graph, { weight: cost }));
    const incremental = time(() => {
      graph.setEdgeWeight(edge, (tick++ % 9) + 1);
      Snapshot.of(graph, { weight: cost, reuse: base });
    });
    expect(incremental).toBeLessThan(full / 2);
  });
});
