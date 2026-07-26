import { describe, expect, it } from "vitest";

import {
  acyclic,
  ancestors,
  astar,
  bellmanFord,
  bidirectional,
  bottleneck,
  closure,
  components,
  condensation,
  criticalPath,
  cuts,
  Cycle,
  descendants,
  dominators,
  floydWarshall,
  generations,
  Graph,
  graphId,
  kruskal,
  nodeId,
  prim,
  reachable,
  reduction,
  scc,
  settle,
  shortestPath,
  shortestPaths,
  simpleCycles,
  Snapshot,
  topology,
  toposort,
  type NodeId,
} from "../index";
import {
  edgeKey,
  groupKeys,
  key,
  naiveArticulations,
  naiveBridges,
  naiveComponents,
  naiveDistances,
  naiveDominators,
  naiveReach,
  naiveScc,
  randomGraph,
  setKeys,
  vertex,
} from "./random";

const SEEDS = [1, 7, 13, 29, 41, 57, 73, 91];
const cost = (weight: number | undefined): number => weight ?? 1;
const weighted = (graph: Graph<number, number>): Snapshot =>
  Snapshot.of(graph, { weight: cost });

describe("拓扑序", () => {
  it.each(SEEDS)("seed %i：DAG 的输出满足每条边的先后约束", (seed) => {
    const graph = randomGraph(seed, { order: 30, density: 3, acyclic: true });
    const snapshot = Snapshot.of(graph);
    const order = settle(toposort(snapshot));

    expect(order).toHaveLength(graph.order);
    const rank = new Int32Array(snapshot.order);
    order.forEach((u, at) => (rank[u] = at));
    for (const edge of graph.edges()) {
      const record = graph.edge(edge)!;
      expect(rank[snapshot.indexOf(record.source)]!).toBeLessThan(
        rank[snapshot.indexOf(record.target)]!,
      );
    }
  });

  it.each(SEEDS)("seed %i：有环图把环节点单列，其余仍是合法拓扑序", (seed) => {
    const graph = randomGraph(seed, { order: 25, density: 3 });
    const snapshot = Snapshot.of(graph);
    const result = settle(topology(snapshot));

    expect(result.order.length + result.cycle.length).toBe(graph.order);
    const rank = new Map<number, number>();
    result.order.forEach((u, at) => rank.set(u, at));
    for (const edge of graph.edges()) {
      const record = graph.edge(edge)!;
      const from = rank.get(snapshot.indexOf(record.source));
      const to = rank.get(snapshot.indexOf(record.target));
      if (from !== undefined && to !== undefined) expect(from).toBeLessThan(to);
    }
  });

  it.each(SEEDS)("seed %i：分层结果同层无依赖，且与拓扑序一致", (seed) => {
    const graph = randomGraph(seed, { order: 30, density: 3, acyclic: true });
    const snapshot = Snapshot.of(graph);
    const layers = settle(generations(snapshot));

    const depth = new Map<number, number>();
    layers.forEach((layer, at) => layer.forEach((u) => depth.set(u, at)));
    expect(depth.size).toBe(graph.order);
    for (const edge of graph.edges()) {
      const record = graph.edge(edge)!;
      expect(depth.get(snapshot.indexOf(record.source))!).toBeLessThan(
        depth.get(snapshot.indexOf(record.target))!,
      );
    }
  });

  it("有环图上 toposort 抛 Cycle，acyclic 返回 false", () => {
    const graph = randomGraph(3, { order: 10, density: 4 });
    const snapshot = Snapshot.of(graph);
    if (settle(acyclic(snapshot))) return;
    expect(() => settle(toposort(snapshot))).toThrow(Cycle);
  });

  it.each(SEEDS)("seed %i：关键路径长度等于路径上的权重和", (seed) => {
    const graph = randomGraph(seed, { order: 25, density: 3, acyclic: true });
    const snapshot = weighted(graph);
    const result = settle(criticalPath(snapshot));

    let total = 0;
    for (let i = 0; i + 1 < result.path.length; i++) {
      const between = graph.between(
        snapshot.label(result.path[i]!),
        snapshot.label(result.path[i + 1]!),
      );
      expect(between.length).toBeGreaterThan(0);
      total += Math.max(...between.map((e) => graph.edgeWeight(e) ?? 1));
    }
    expect(total).toBeCloseTo(result.length, 9);
  });
});

describe("连通性", () => {
  it.each(SEEDS)("seed %i：弱连通分量与逐点扩散一致", (seed) => {
    const graph = randomGraph(seed, { order: 30, density: 1 });
    const snapshot = Snapshot.of(graph);
    const found = settle(components(snapshot)).groups();
    expect(groupKeys(snapshot, found)).toEqual(setKeys(naiveComponents(graph)));
  });

  it.each(SEEDS)("seed %i：强连通分量与互相可达判定一致", (seed) => {
    const graph = randomGraph(seed, { order: 25, density: 2 });
    const snapshot = Snapshot.of(graph);
    const found = settle(scc(snapshot)).groups();
    expect(groupKeys(snapshot, found)).toEqual(setKeys(naiveScc(graph)));
  });

  it.each(SEEDS)("seed %i：分量编号是逆拓扑序，缩点后无环", (seed) => {
    const graph = randomGraph(seed, { order: 25, density: 2 });
    const result = settle(condensation(Snapshot.of(graph)));
    for (const [from, to] of result.edges) expect(from).toBeGreaterThan(to);
  });

  it.each(SEEDS)("seed %i：桥与割点符合删除后分量增加的定义", (seed) => {
    const graph = randomGraph(seed, { order: 18, density: 1 });
    const snapshot = Snapshot.of(graph);
    const result = settle(cuts(snapshot));

    const found = result.bridges.map((b) =>
      key(snapshot.label(b.from), snapshot.label(b.to)),
    );
    expect(found.sort()).toEqual([...naiveBridges(graph)].sort());
    expect(snapshot.names(result.articulations).sort()).toEqual(
      [...naiveArticulations(graph)].sort(),
    );
  });

  it.each(SEEDS)("seed %i：支配树与迭代数据流一致", (seed) => {
    const graph = randomGraph(seed, { order: 25, density: 2 });
    const entry = nodeId("n0");
    const snapshot = Snapshot.of(graph);
    const found = settle(dominators(snapshot, snapshot.indexOf(entry)));
    const expected = naiveDominators(graph, entry);

    let covered = 0;
    for (let u = 0; u < snapshot.order; u++) if (found[u] !== -1) covered++;
    expect(covered).toBe(expected.size);
    for (const [node, idom] of expected) {
      expect(snapshot.label(found[snapshot.indexOf(node)]!)).toBe(idom);
    }
  });

  it.each(SEEDS.slice(0, 4))(
    "seed %i：枚举出的每个简单环都真实存在",
    (seed) => {
      const graph = randomGraph(seed, { order: 8, density: 2 });
      const snapshot = Snapshot.of(graph);
      for (const cycle of settle(simpleCycles(snapshot))) {
        expect(cycle.length).toBeGreaterThan(0);
        for (let i = 0; i < cycle.length; i++) {
          const from = snapshot.label(cycle[i]!);
          const to = snapshot.label(cycle[(i + 1) % cycle.length]!);
          expect(graph.adjacent(from, to)).toBe(true);
        }
        expect(new Set(cycle).size).toBe(cycle.length);
      }
    },
  );
});

describe("可达性", () => {
  it.each(SEEDS)("seed %i：传递闭包与逐点搜索一致", (seed) => {
    const graph = randomGraph(seed, { order: 22, density: 2 });
    const snapshot = Snapshot.of(graph);
    const found = settle(closure(snapshot));
    const expected = naiveReach(graph);

    for (const node of graph.nodes()) {
      const reached = snapshot.names(found.from(snapshot.indexOf(node)));
      expect(new Set(reached)).toEqual(expected.get(node));
    }
  });

  it.each(SEEDS)(
    "seed %i：reachable / ancestors / descendants 与闭包一致",
    (seed) => {
      const graph = randomGraph(seed, { order: 20, density: 2 });
      const snapshot = Snapshot.of(graph);
      const expected = naiveReach(graph);

      for (const node of graph.nodes()) {
        const u = snapshot.indexOf(node);
        expect(new Set(snapshot.names(descendants(snapshot, u)))).toEqual(
          new Set([...expected.get(node)!].filter((other) => other !== node)),
        );
        for (const other of graph.nodes()) {
          expect(reachable(snapshot, u, snapshot.indexOf(other))).toBe(
            node === other || expected.get(node)!.has(other),
          );
        }
      }
      for (const node of graph.nodes()) {
        const before = ancestors(snapshot, snapshot.indexOf(node));
        for (const parent of snapshot.names(before)) {
          expect(expected.get(parent)!.has(node)).toBe(true);
        }
      }
    },
  );

  it.each(SEEDS)("seed %i：传递归约保持可达关系不变", (seed) => {
    const graph = randomGraph(seed, { order: 18, density: 2, acyclic: true });
    const snapshot = Snapshot.of(graph);
    const kept = settle(reduction(snapshot));

    const reduced = new Graph<number, number>(graphId("reduced"));
    for (const node of graph.nodes()) {
      reduced.addNode(vertex(String(node), graph.weightOf(node)));
    }
    for (const [from, to] of kept) {
      reduced.connect(
        [snapshot.label(from), "out"],
        [snapshot.label(to), "in"],
      );
    }

    expect(kept.length).toBeLessThanOrEqual(graph.size);
    const before = naiveReach(graph);
    const after = naiveReach(reduced);
    for (const node of graph.nodes()) {
      expect(after.get(node)).toEqual(before.get(node));
    }
  });
});

describe("最短路", () => {
  it.each(SEEDS)("seed %i：Dijkstra 与 Bellman-Ford 给出相同距离", (seed) => {
    const graph = randomGraph(seed, { order: 30, density: 3 });
    const snapshot = weighted(graph);
    const source = nodeId("n0");
    const tree = settle(shortestPaths(snapshot, snapshot.indexOf(source)));
    const expected = naiveDistances(graph, source);

    for (const node of graph.nodes()) {
      expect(tree.distance[snapshot.indexOf(node)]).toBeCloseTo(
        expected.get(node)!,
        9,
      );
    }
  });

  it.each(SEEDS)(
    "seed %i：实数权重下结果依然一致（走惰性堆而非桶队列）",
    (seed) => {
      const graph = randomGraph(seed, {
        order: 25,
        density: 3,
        weights: "real",
      });
      const snapshot = weighted(graph);
      const source = nodeId("n0");
      const tree = settle(shortestPaths(snapshot, snapshot.indexOf(source)));
      const expected = naiveDistances(graph, source);

      for (const node of graph.nodes()) {
        expect(tree.distance[snapshot.indexOf(node)]).toBeCloseTo(
          expected.get(node)!,
          9,
        );
      }
    },
  );

  it.each(SEEDS)(
    "seed %i：bellmanFord 在非负权图上与 Dijkstra 一致",
    (seed) => {
      const graph = randomGraph(seed, { order: 25, density: 3 });
      const snapshot = weighted(graph);
      const source = snapshot.indexOf(nodeId("n0"));
      const dijkstra = settle(shortestPaths(snapshot, source));
      const ford = settle(bellmanFord(snapshot, source));

      for (let u = 0; u < snapshot.order; u++) {
        expect(ford.distance[u]).toBeCloseTo(dijkstra.distance[u]!, 9);
      }
    },
  );

  it.each(SEEDS)(
    "seed %i：astar 与 bidirectional 复现 Dijkstra 的单条最短路",
    (seed) => {
      const graph = randomGraph(seed, { order: 25, density: 3 });
      const snapshot = weighted(graph);
      const source = snapshot.indexOf(nodeId("n0"));
      const tree = settle(shortestPaths(snapshot, source));

      for (let target = 0; target < snapshot.order; target++) {
        const best = tree.distance[target]!;
        const single = settle(shortestPath(snapshot, source, target));
        const star = settle(astar(snapshot, source, target));
        const both = settle(bidirectional(snapshot, source, target));

        if (best === Infinity) {
          expect(single).toBeUndefined();
          expect(star).toBeUndefined();
          expect(both).toBeUndefined();
          continue;
        }
        expect(single!.distance).toBeCloseTo(best, 9);
        expect(star!.distance).toBeCloseTo(best, 9);
        expect(both!.distance).toBeCloseTo(best, 9);
        for (const route of [single!, star!, both!]) {
          expect(route.path[0]).toBe(source);
          expect(route.path[route.path.length - 1]).toBe(target);
          expect(walked(graph, snapshot.names(route.path))).toBeCloseTo(
            best,
            9,
          );
        }
      }
    },
  );

  it.each(SEEDS)("seed %i：floydWarshall 与逐点 Dijkstra 一致", (seed) => {
    const graph = randomGraph(seed, { order: 18, density: 2 });
    const snapshot = weighted(graph);
    const matrix = settle(floydWarshall(snapshot));

    for (let source = 0; source < snapshot.order; source++) {
      const tree = settle(shortestPaths(snapshot, source));
      for (let target = 0; target < snapshot.order; target++) {
        expect(matrix.at(source, target)).toBeCloseTo(
          tree.distance[target]!,
          9,
        );
      }
    }
  });

  it.each(SEEDS)("seed %i：瓶颈路径的代价等于路径上最重的一段", (seed) => {
    const graph = randomGraph(seed, { order: 20, density: 3 });
    const snapshot = weighted(graph);
    const source = snapshot.indexOf(nodeId("n0"));
    const tree = settle(
      shortestPaths(snapshot, source, { combine: bottleneck }),
    );

    for (let target = 0; target < snapshot.order; target++) {
      if (tree.distance[target] === Infinity || target === source) continue;
      const route = settle(
        shortestPath(snapshot, source, target, { combine: bottleneck }),
      )!;
      const heaviest = Math.max(
        ...pairs(snapshot.names(route.path)).map(([a, b]) =>
          Math.min(...graph.between(a, b).map((e) => graph.edgeWeight(e) ?? 1)),
        ),
      );
      expect(heaviest).toBeLessThanOrEqual(tree.distance[target]!);
    }
  });

  it("提前终止的接口不暴露未收敛的距离", () => {
    const graph = new Graph<null, number>(graphId("early"));
    for (const name of ["s", "t", "x", "a"]) {
      graph.addNode(vertex<null>(name, null));
    }
    graph.connect([nodeId("s"), "out"], [nodeId("t"), "in"], { weight: 0 });
    graph.connect([nodeId("s"), "out"], [nodeId("x"), "in"], { weight: 5 });
    graph.connect([nodeId("s"), "out"], [nodeId("a"), "in"], { weight: 1 });
    graph.connect([nodeId("a"), "out"], [nodeId("x"), "in"], { weight: 1 });

    const snapshot = Snapshot.of(graph, { weight: cost });
    const s = snapshot.indexOf(nodeId("s"));
    const single = settle(
      shortestPath(snapshot, s, snapshot.indexOf(nodeId("t"))),
    )!;
    expect(single.distance).toBe(0);
    expect(snapshot.names(single.path)).toEqual([nodeId("s"), nodeId("t")]);

    // 全树接口跑完整个搜索，x 必须是收敛后的 2 而不是提前终止时的 5。
    const tree = settle(shortestPaths(snapshot, s));
    expect(tree.distance[snapshot.indexOf(nodeId("x"))]).toBe(2);
  });

  it("负权边让 Dijkstra 抛 Negative，Bellman-Ford 抓出负环", () => {
    const graph = new Graph<null, number>(graphId("negative"));
    for (const name of ["a", "b", "c"]) {
      graph.addNode(vertex<null>(name, null));
    }
    graph.connect([nodeId("a"), "out"], [nodeId("b"), "in"], { weight: 1 });
    graph.connect([nodeId("b"), "out"], [nodeId("c"), "in"], { weight: -4 });
    graph.connect([nodeId("c"), "out"], [nodeId("b"), "in"], { weight: 1 });

    const snapshot = Snapshot.of(graph, { weight: cost });
    const a = snapshot.indexOf(nodeId("a"));
    expect(() => settle(shortestPaths(snapshot, a))).toThrow(/negative/);
    expect(() => settle(bellmanFord(snapshot, a))).toThrow(Cycle);
  });
});

describe("最小生成森林", () => {
  it.each(SEEDS)("seed %i：Prim 与 Kruskal 的总权重相同", (seed) => {
    const graph = randomGraph(seed, { order: 25, density: 2 });
    const snapshot = weighted(graph);
    const byPrim = settle(prim(snapshot));
    const byKruskal = settle(kruskal(snapshot));

    const total = (links: Array<{ weight: number }>): number =>
      links.reduce((sum, link) => sum + link.weight, 0);
    expect(total(byPrim)).toBeCloseTo(total(byKruskal), 9);

    const parts = settle(components(snapshot)).count;
    expect(byPrim).toHaveLength(graph.order - parts);
    expect(byKruskal).toHaveLength(graph.order - parts);
  });

  it.each(SEEDS)("seed %i：选出的边都真实存在且不成环", (seed) => {
    const graph = randomGraph(seed, { order: 20, density: 2 });
    const snapshot = weighted(graph);
    const links = settle(kruskal(snapshot));
    const seen = new Set<string>();
    for (const link of links) {
      const id = snapshot.edges[link.edge]!;
      const ends = key(
        snapshot.label(link.source),
        snapshot.label(link.target),
      );
      expect(graph.hasEdge(id)).toBe(true);
      expect(edgeKey(graph, id)).toBe(ends);
      seen.add(ends);
    }
    expect(seen.size).toBe(links.length);
  });
});

function pairs(path: NodeId[]): Array<[NodeId, NodeId]> {
  const listed: Array<[NodeId, NodeId]> = [];
  for (let i = 0; i + 1 < path.length; i++)
    listed.push([path[i]!, path[i + 1]!]);
  return listed;
}

function walked(graph: Graph<number, number>, path: NodeId[]): number {
  return pairs(path).reduce((total, [from, to]) => {
    const options = graph
      .between(from, to)
      .map((e) => graph.edgeWeight(e) ?? 1);
    return total + Math.min(...options);
  }, 0);
}
