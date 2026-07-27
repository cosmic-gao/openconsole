import { describe, expect, it } from "vitest";

import {
  costOf,
  Graph,
  graphId,
  inDegree,
  Invalid,
  merged,
  nodeId,
  Oneway,
  outDegree,
  scc,
  settle,
  shortestPath,
  Snapshot,
  Stale,
  toposort,
  type NodeId,
} from "../index";
import { cost, outOf, randomGraph, vertex, weighted } from "./support";

describe("编译", () => {
  it("邻接与源图一致", () => {
    const graph = randomGraph(21, { order: 25, density: 3 });
    const snapshot = Snapshot.of(graph);

    expect(snapshot.order).toBe(graph.order);
    expect(snapshot.size).toBe(graph.size);
    for (const node of graph.nodes()) {
      expect(outOf(snapshot, node)).toEqual(
        graph.outNeighbors(node).slice().sort(),
      );
      const u = snapshot.indexOf(node);
      expect(outDegree(snapshot, u)).toBe(graph.outDegree(node));
      expect(inDegree(snapshot, u)).toBe(graph.inDegree(node));
    }
  });

  it("跳过删除留下的空位", () => {
    const graph = randomGraph(22, { order: 15, density: 2 });
    for (const node of graph.nodes().slice(0, 5)) graph.dropNode(node);
    const snapshot = Snapshot.of(graph);

    expect(snapshot.order).toBe(graph.order);
    expect(snapshot.labels.every((id) => graph.hasNode(id))).toBe(true);
  });

  it("平行边各有独立权重", () => {
    const graph = new Graph<null, number>(graphId("parallel"));
    graph.addNode(vertex<null>("a", null));
    graph.addNode(vertex<null>("b", null));
    graph.connect([nodeId("a"), "out"], [nodeId("b"), "in"], { weight: 3 });
    graph.connect([nodeId("a"), "out"], [nodeId("b"), "in"], { weight: 7 });

    const snapshot = Snapshot.of(graph, { weight: cost });
    const { offset, edge } = snapshot.outbound;
    const u = snapshot.indexOf(nodeId("a"));
    const weights: number[] = [];
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      weights.push(costOf(snapshot, edge[k]!));
    }
    expect(weights.sort()).toEqual([3, 7]);
  });

  it("NaN 权在编译期就报错，并报得出是哪条边", () => {
    // NaN 与任何值比较都是 false：漏到算法里就是连通节点被静默报成不可达。
    const graph = randomGraph(5, { order: 6, density: 2 });
    expect(() => Snapshot.of(graph, { weight: () => NaN })).toThrow(Invalid);
    expect(() => Snapshot.of(graph, { weight: () => NaN })).toThrow(
      new RegExp(`edge ${graph.edgeIdAt(0)}`),
    );
  });

  it("未编译权重时每条边按 1 计", () => {
    const snapshot = Snapshot.of(randomGraph(23, { order: 10, density: 2 }));
    expect(snapshot.weight).toBeUndefined();
    expect(costOf(snapshot, 0)).toBe(1);
  });
});

describe("编译期视图", () => {
  it("节点过滤只保留满足谓词的节点及其内部边", () => {
    const graph = randomGraph(24, { order: 20, density: 2 });
    const keep = (node: NodeId): boolean =>
      Number(String(node).slice(1)) % 2 === 0;
    const snapshot = Snapshot.of(graph, { node: keep });

    expect(snapshot.labels.every(keep)).toBe(true);
    for (const node of snapshot.labels) {
      expect(outOf(snapshot, node)).toEqual(
        graph.outNeighbors(node).filter(keep).slice().sort(),
      );
    }
  });

  it("边过滤按边谓词裁剪", () => {
    const graph = randomGraph(25, { order: 15, density: 3 });
    const heavy = Snapshot.of(graph, {
      edge: (edge) => (edge.weight ?? 0) > 5,
      weight: cost,
    });

    expect(heavy.order).toBe(graph.order);
    expect([...heavy.weight!].every((value) => value > 5)).toBe(true);
  });

  it("折叠把分组当单节点：组内边消失，跨组边聚合到组上", () => {
    const graph = new Graph<null, number>(graphId("folded"));
    for (const name of ["group", "x", "y", "outside"]) {
      graph.addNode(vertex<null>(name, null));
    }
    graph.setParent(nodeId("x"), nodeId("group"));
    graph.setParent(nodeId("y"), nodeId("group"));
    graph.connect([nodeId("x"), "out"], [nodeId("y"), "in"]);
    graph.connect([nodeId("y"), "out"], [nodeId("outside"), "in"]);

    const snapshot = Snapshot.of(graph, { collapse: [nodeId("group")] });
    expect(new Set(snapshot.labels)).toEqual(
      new Set([nodeId("group"), nodeId("outside")]),
    );
    expect(outOf(snapshot, nodeId("group"))).toEqual([nodeId("outside")]);
    expect(snapshot.size).toBe(1);
  });

  it("折叠后的图仍可直接跑算法", () => {
    const graph = randomGraph(26, { order: 16, density: 2, acyclic: true });
    graph.setParent(nodeId("n2"), nodeId("n1"));
    graph.setParent(nodeId("n3"), nodeId("n1"));
    const folded = Snapshot.of(graph, { collapse: [nodeId("n1")] });

    expect(folded.order).toBe(graph.order - 2);
    expect(settle(scc(folded)).count).toBeGreaterThan(0);
  });

  it("无向编译让每条边在两端各出现一次", () => {
    const graph = new Graph<null, number>(graphId("undirected"));
    graph.addNode(vertex<null>("a", null));
    graph.addNode(vertex<null>("b", null));
    graph.connect([nodeId("a"), "out"], [nodeId("b"), "in"]);

    const snapshot = Snapshot.of(graph, { undirected: true });
    expect(outOf(snapshot, nodeId("a"))).toEqual([nodeId("b")]);
    expect(outOf(snapshot, nodeId("b"))).toEqual([nodeId("a")]);
    expect(merged(snapshot)).toBe(true);
  });

  it("outbound 省掉入向邻接，只用出边的算法照常工作", () => {
    const graph = randomGraph(27, { order: 12, density: 2, acyclic: true });
    const snapshot = Snapshot.of(graph, { outbound: true });

    expect(snapshot.inbound).toBeUndefined();
    expect(() => snapshot.reverse()).toThrow(Oneway);
    expect(settle(toposort(snapshot))).toHaveLength(graph.order);
  });

  it("reverse 翻转方向、共享底层数组，且不重建索引表", () => {
    const graph = randomGraph(28, { order: 15, density: 2 });
    const snapshot = Snapshot.of(graph);
    const flipped = snapshot.reverse();

    expect(flipped.outbound).toBe(snapshot.inbound);
    expect(flipped.inbound).toBe(snapshot.outbound);
    for (const node of graph.nodes()) {
      expect(flipped.indexOf(node)).toBe(snapshot.indexOf(node));
      expect(outOf(flipped, node)).toEqual(
        graph.inNeighbors(node).slice().sort(),
      );
    }

    const wide = Snapshot.of(randomGraph(32, { order: 4000, density: 2 }));
    const started = performance.now();
    for (let i = 0; i < 2000; i++) wide.reverse();
    // 逐次重建索引表的话，2000 × 4000 次 Map.set 远超这个上限。
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("与源图的同步", () => {
  it("图未变时 current 为真，变更后 verify 抛 Stale", () => {
    const graph = randomGraph(29, { order: 10, density: 2 });
    const snapshot = Snapshot.of(graph);
    expect(snapshot.current).toBe(true);
    expect(() => snapshot.verify()).not.toThrow();

    graph.addNode(vertex("extra", 99));
    expect(snapshot.current).toBe(false);
    expect(() => snapshot.verify()).toThrow(Stale);
  });
});

describe("跨线程搬运", () => {
  it("data 可结构化克隆，还原出等价快照", () => {
    const graph = randomGraph(31, { order: 20, density: 2 });
    const snapshot = weighted(graph);
    const revived = Snapshot.from(structuredClone(snapshot.data));

    expect(revived.order).toBe(snapshot.order);
    expect(revived.size).toBe(snapshot.size);
    expect([...revived.labels]).toEqual([...snapshot.labels]);
    expect([...revived.weight!]).toEqual([...snapshot.weight!]);
    for (const node of graph.nodes()) {
      expect(outOf(revived, node)).toEqual(outOf(snapshot, node));
    }
    // 还原出来的快照没有源图，因此不会误报陈旧。
    expect(revived.current).toBe(true);
    expect(settle(scc(revived)).count).toBe(settle(scc(snapshot)).count);
  });

  it("core 省掉标签层，索引空间算法照跑，问名字则明确报错", () => {
    const graph = randomGraph(31, { order: 20, density: 2, acyclic: true });
    const snapshot = weighted(graph);
    const revived = Snapshot.from(structuredClone(snapshot.core));

    expect([...settle(toposort(revived))]).toEqual([
      ...settle(toposort(snapshot)),
    ]);
    expect(revived.at(0)).toBeUndefined();
    expect(revived.indexOf(graph.nodes()[0]!)).toBe(-1);
    expect(() => revived.names([0])).toThrow(/without labels/);
  });
});

describe("增量重编译", () => {
  const build = (): Graph<number, number> =>
    randomGraph(89, { order: 200, density: 3 });

  it("什么都没变时原样返回同一个快照", () => {
    const graph = build();
    const base = weighted(graph);
    expect(Snapshot.of(graph, { weight: cost, reuse: base })).toBe(base);
  });

  it("只动权重时复用 CSR，只重算权重数组", () => {
    const graph = build();
    const base = weighted(graph);
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

    expect(next.weight![base.edges.indexOf(edge)]).toBe(999);
    expect([...next.weight!]).toEqual([...weighted(graph).weight!]);
  });

  it("复用出来的快照不吃旧的边权画像缓存", () => {
    const graph = new Graph<number, number>(graphId("reweigh"));
    for (const name of ["a", "b", "c"]) graph.addNode(vertex(name, 0));
    graph.connect([nodeId("a"), "out"], [nodeId("b"), "in"], { weight: 1 });
    const long = graph.connect([nodeId("b"), "out"], [nodeId("c"), "in"], {
      weight: 1,
    });
    graph.connect([nodeId("a"), "out"], [nodeId("c"), "in"], { weight: 5 });

    const base = weighted(graph);
    expect(settle(shortestPath(base, 0, 2))!.distance).toBe(2);

    graph.setEdgeWeight(long, 100);
    const next = Snapshot.of(graph, { weight: cost, reuse: base });
    expect(settle(shortestPath(next, 0, 2))!.distance).toBe(5);
  });

  it("结构一变就退回全量编译", () => {
    const graph = build();
    const base = weighted(graph);
    graph.addNode(vertex("extra", 0));

    const next = Snapshot.of(graph, { weight: cost, reuse: base });
    expect(next.outbound).not.toBe(base.outbound);
    expect(next.order).toBe(base.order + 1);
  });

  it("带谓词、换选项、传别的图、传翻转过的快照，都只是没有加速", () => {
    const graph = build();
    const base = weighted(graph);
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

    const stranger = weighted(randomGraph(90, { order: 30, density: 2 }));
    const crossed = Snapshot.of(graph, { weight: cost, reuse: stranger });
    expect(crossed.order).toBe(graph.order);
    expect(crossed.outbound).not.toBe(stranger.outbound);

    // 翻转过的快照方向与选项对不上，复用它会静默给出反向结构。
    const flipped = Snapshot.of(graph, {
      weight: cost,
      reuse: base.reverse(),
    });
    expect([...flipped.outbound.other]).toEqual([...base.outbound.other]);
  });
});
