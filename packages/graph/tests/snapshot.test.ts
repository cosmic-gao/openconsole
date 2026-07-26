import { describe, expect, it } from "vitest";

import {
  costOf,
  Graph,
  graphId,
  inDegree,
  Invalid,
  merged,
  nodeId,
  outDegree,
  scc,
  settle,
  Snapshot,
  Stale,
  toposort,
  type NodeId,
} from "../index";
import { randomGraph, vertex } from "./random";

const cost = (weight: number | undefined): number => weight ?? 1;
const outOf = (snapshot: Snapshot, node: NodeId): NodeId[] => {
  const u = snapshot.indexOf(node);
  const found: NodeId[] = [];
  for (
    let k = snapshot.outbound.offset[u]!;
    k < snapshot.outbound.offset[u + 1]!;
    k++
  ) {
    found.push(snapshot.at(snapshot.outbound.other[k]!)!);
  }
  return found.sort();
};

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
    const u = snapshot.indexOf(nodeId("a"));
    const weights: number[] = [];
    for (
      let k = snapshot.outbound.offset[u]!;
      k < snapshot.outbound.offset[u + 1]!;
      k++
    ) {
      weights.push(costOf(snapshot, snapshot.outbound.edge[k]!));
    }
    expect(weights.sort()).toEqual([3, 7]);
  });

  it("weight 回调给出 NaN 时编译即报错，并报得出是哪条边", () => {
    // NaN 与任何值比较都是 false：漏到算法里就是一个连通节点被静默报成不可达。
    const graph = randomGraph(5, { order: 6, density: 2 });
    expect(() => Snapshot.of(graph, { weight: () => NaN })).toThrow(Invalid);
    expect(() => Snapshot.of(graph, { weight: () => NaN })).toThrow(
      new RegExp(`edge ${graph.edgeIdAt(0)}`),
    );
  });

  it("未编译权重时每条边按 1 计", () => {
    const graph = randomGraph(23, { order: 10, density: 2 });
    const snapshot = Snapshot.of(graph);
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

  it("折叠把分组当单节点，组内边消失、跨组边聚合", () => {
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

  it("outbound 省掉入向邻接，reverse 随之不可用", () => {
    const graph = randomGraph(27, { order: 12, density: 2, acyclic: true });
    const snapshot = Snapshot.of(graph, { outbound: true });

    expect(snapshot.inbound).toBeUndefined();
    expect(() => snapshot.reverse()).toThrow(/inbound/);
    // 只用出边的算法照常工作。
    expect(settle(toposort(snapshot))).toHaveLength(graph.order);
  });

  it("reverse 是真 O(1)：翻转 2000 次不随节点数付费", () => {
    const snapshot = Snapshot.of(randomGraph(32, { order: 4000, density: 2 }));
    const start = performance.now();
    for (let i = 0; i < 2000; i++) snapshot.reverse();
    // 逐次重建索引表的话，2000 × 4000 次 Map.set 远超这个上限。
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("reverse 翻转方向且与原快照共享底层数组", () => {
    const graph = randomGraph(28, { order: 15, density: 2 });
    const snapshot = Snapshot.of(graph);
    const flipped = snapshot.reverse();

    expect(flipped.outbound).toBe(snapshot.inbound);
    expect(flipped.inbound).toBe(snapshot.outbound);
    for (const node of graph.nodes()) {
      expect(flipped.indexOf(node)).toBe(snapshot.indexOf(node));
    }
    for (const node of graph.nodes()) {
      expect(outOf(flipped, node)).toEqual(
        graph.inNeighbors(node).slice().sort(),
      );
    }
  });
});

describe("与源图的同步", () => {
  it("图未变时 current 为真", () => {
    const graph = randomGraph(29, { order: 10, density: 2 });
    const snapshot = Snapshot.of(graph);
    expect(snapshot.current).toBe(true);
    expect(() => snapshot.verify()).not.toThrow();
  });

  it("图变更后 verify 抛 Stale，不再静默给旧答案", () => {
    const graph = randomGraph(30, { order: 10, density: 2 });
    const snapshot = Snapshot.of(graph);
    graph.addNode(vertex("extra", 99));

    expect(snapshot.current).toBe(false);
    expect(() => snapshot.verify()).toThrow(Stale);
  });
});

describe("跨线程搬运", () => {
  it("data 可结构化克隆，from 能在另一侧还原出等价快照", () => {
    const graph = randomGraph(31, { order: 20, density: 2 });
    const snapshot = Snapshot.of(graph, { weight: cost });
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

  it("core 省掉标签层，索引空间的算法照跑，问名字则明确报错", () => {
    const graph = randomGraph(31, { order: 20, density: 2, acyclic: true });
    const snapshot = Snapshot.of(graph, { weight: cost });
    const revived = Snapshot.from(structuredClone(snapshot.core));

    expect(revived.order).toBe(snapshot.order);
    expect(revived.size).toBe(snapshot.size);
    expect([...revived.weight!]).toEqual([...snapshot.weight!]);
    expect([...settle(toposort(revived))]).toEqual([
      ...settle(toposort(snapshot)),
    ]);
    // 名字没搬过来：查不到就是查不到，且错误说得出原因。
    expect(revived.at(0)).toBeUndefined();
    expect(revived.indexOf(graph.nodes()[0]!)).toBe(-1);
    expect(() => revived.names([0])).toThrow(/without labels/);
  });
});
