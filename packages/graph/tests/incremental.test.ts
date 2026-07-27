import { describe, expect, it } from "vitest";

import {
  Graph,
  graphId,
  nodeId,
  Ordering,
  settle,
  Snapshot,
  toposort,
  type NodeId,
} from "../index";
import { randomGraph, Rng, vertex } from "./support";

/** 除被排除的冲突边外，每条边都必须满足 rank(source) < rank(target)。 */
function consistent(
  graph: Graph<number, number>,
  ordering: Ordering<number, number>,
): void {
  for (const edge of graph.edges()) {
    if (ordering.conflicts.has(graph.edgeIndexOf(edge))) continue;
    const record = graph.edge(edge)!;
    if (record.source === record.target) continue;
    expect(ordering.rank(record.source)!).toBeLessThan(
      ordering.rank(record.target)!,
    );
  }
}

const dag = (seed: number, order: number): Graph<number, number> =>
  randomGraph(seed, { order, density: 2, acyclic: true });

describe("增量拓扑序", () => {
  it("空图起步，逐条加边后顺序始终合法", () => {
    const graph = new Graph<number, number>(graphId("grow"));
    const ordering = new Ordering(graph);
    const rng = new Rng(7);

    for (let i = 0; i < 30; i++) graph.addNode(vertex(`n${i}`, i));
    for (let i = 0; i < 60; i++) {
      const from = rng.int(30);
      const to = rng.int(30);
      if (from === to) continue;
      graph.connect([nodeId(`n${from}`), "out"], [nodeId(`n${to}`), "in"]);
      consistent(graph, ordering);
    }
    ordering.dispose();
  });

  it("DAG 上与全量拓扑排序等效", () => {
    const graph = dag(61, 25);
    const ordering = new Ordering(graph);

    expect(ordering.cyclic).toBe(false);
    expect(ordering.conflicts.size).toBe(0);
    expect(ordering.sorted()).toHaveLength(graph.order);
    consistent(graph, ordering);

    const rank = new Map(ordering.sorted().map((id, at) => [id, at]));
    for (const edge of graph.edges()) {
      const record = graph.edge(edge)!;
      expect(rank.get(record.source)!).toBeLessThan(rank.get(record.target)!);
    }
    ordering.dispose();
  });

  it("成环的边被排除而不是触发重算，剩余子图仍然有序", () => {
    const graph = new Graph<number, number>(graphId("cyclic"));
    for (const name of ["a", "b", "c"]) graph.addNode(vertex(name, 0));
    const ordering = new Ordering(graph);

    graph.connect([nodeId("a"), "out"], [nodeId("b"), "in"]);
    graph.connect([nodeId("b"), "out"], [nodeId("c"), "in"]);
    expect(ordering.cyclic).toBe(false);

    const back = graph.connect([nodeId("c"), "out"], [nodeId("a"), "in"]);
    expect(ordering.cyclic).toBe(true);
    expect(ordering.conflicts).toContain(graph.edgeIndexOf(back));
    consistent(graph, ordering);
    expect(ordering.cycles().flat().sort()).toEqual(
      ["a", "b", "c"].map(nodeId),
    );

    graph.disconnect(back);
    expect(ordering.cyclic).toBe(false);
    expect(ordering.cycles()).toEqual([]);
    ordering.dispose();
  });

  it("带环起步时也能给出可用的顺序", () => {
    const graph = randomGraph(62, { order: 20, density: 3 });
    const ordering = new Ordering(graph);

    expect(ordering.sorted()).toHaveLength(graph.order);
    consistent(graph, ordering);
    ordering.dispose();
  });

  it("增删节点后 rank 表跟着变", () => {
    const graph = dag(63, 12);
    const ordering = new Ordering(graph);

    graph.addNode(vertex("late", 0));
    expect(ordering.rank(nodeId("late"))).toBeDefined();

    graph.dropNode(nodeId("n0"));
    expect(ordering.rank(nodeId("n0"))).toBeUndefined();
    expect(ordering.sorted()).toHaveLength(graph.order);
    consistent(graph, ordering);
    ordering.dispose();
  });

  it("事务里的批量变更在末尾一次消化", () => {
    const graph = dag(64, 15);
    const ordering = new Ordering(graph);

    graph.batch(() => {
      for (let i = 0; i < 5; i++) graph.addNode(vertex(`x${i}`, i));
      for (let i = 0; i < 4; i++) {
        graph.connect([nodeId(`x${i + 1}`), "out"], [nodeId(`x${i}`), "in"]);
      }
    });

    consistent(graph, ordering);
    expect(ordering.sorted()).toHaveLength(graph.order);
    ordering.dispose();
  });

  it("compare 可直接用作排序比较器", () => {
    const graph = dag(65, 15);
    const ordering = new Ordering(graph);
    const shuffled: NodeId[] = graph.nodes().slice().reverse();

    expect(shuffled.slice().sort((a, b) => ordering.compare(a, b))).toEqual(
      ordering.sorted(),
    );
    ordering.dispose();
  });

  it("refresh 后与全量重算一致", () => {
    const graph = dag(66, 20);
    const ordering = new Ordering(graph);
    graph.connect([nodeId("n19"), "out"], [nodeId("n0"), "in"]);
    ordering.refresh();
    consistent(graph, ordering);

    const withoutConflicts = Snapshot.of(graph, {
      edge: (edge) => !ordering.conflicts.has(graph.edgeIndexOf(edge.id)),
    });
    expect(settle(toposort(withoutConflicts))).toHaveLength(graph.order);
    ordering.dispose();
  });

  it("dispose 之后不再跟随图变化", () => {
    const graph = dag(67, 10);
    const ordering = new Ordering(graph);
    ordering.dispose();

    graph.addNode(vertex("ghost", 0));
    expect(ordering.rank(nodeId("ghost"))).toBeUndefined();
  });
});
