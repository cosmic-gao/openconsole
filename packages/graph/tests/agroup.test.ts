import { describe, expect, it } from "vitest";

import {
  bfsLevels,
  type Catalog,
  csr,
  csrPath,
  dijkstra,
  type EdgeView,
  type GraphId,
  Graph,
  type IntoEdges,
  type NodeId,
  Socket,
  sssp,
  StableGraph,
  Vertex,
} from "../index";

/** 确定性 LCG，保证随机图可复现。 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface Built {
  graph: Graph<unknown, number>;
  ids: NodeId[];
  weight: (from: NodeId, to: NodeId) => number;
}

/** 构造无平行边的随机带权有向图。 */
function build(n: number, m: number, seed: number, Ctor = Graph): Built {
  const r = rng(seed);
  const graph = new Ctor<unknown, number>("g" as GraphId);
  const ids: NodeId[] = [];
  for (let i = 0; i < n; i++) {
    const id = `n${i}` as NodeId;
    const v = new Vertex(id);
    v.addInput("in", Socket.any);
    v.addOutput("out", Socket.any);
    graph.addNode(v);
    ids.push(id);
  }
  const wmap = new Map<string, number>();
  const seen = new Set<string>();
  for (let e = 0; e < m; e++) {
    const a = ids[Math.floor(r() * n)]!;
    const b = ids[Math.floor(r() * n)]!;
    if (a === b) continue;
    const key = `${a}->${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const w = 1 + Math.floor(r() * 20);
    wmap.set(key, w);
    graph.connect([a, "out"], [b, "in"], { weight: w });
  }
  return {
    graph,
    ids,
    weight: (from, to) => wmap.get(`${from}->${to}`) ?? 1,
  };
}

const cost = (edge: EdgeView<number>): number => edge.weight ?? 1;

/** 剥去 NodeIndexable，强制 dijkstra 走通用（稀疏）路径。 */
function opaque<E>(g: Graph<unknown, E>): Catalog & IntoEdges<E> {
  return {
    order: g.order,
    size: g.size,
    nodes: () => g.nodes(),
    edges: () => g.edges(),
    edgeViews: () => g.edgeViews(),
    inEdges: (node: NodeId) => g.inEdges(node),
    outEdges: (node: NodeId) => g.outEdges(node),
  };
}

describe("A-1 dijkstra 稠密整数下标快路与通用实现等价", () => {
  for (const seed of [1, 7, 42, 99, 2024]) {
    it(`seed=${seed} 距离一致`, () => {
      const { graph, ids } = build(120, 500, seed);
      const start = ids[0]!;
      const dense = dijkstra(graph, start, undefined, cost); // Graph 可索引 → 稠密路
      const sparse = dijkstra(opaque(graph), start, undefined, cost); // 强制通用路

      expect(new Set(dense.keys())).toEqual(new Set(sparse.keys()));
      for (const [node, entry] of dense) {
        expect(entry.distance).toBe(sparse.get(node)!.distance);
      }
    });
  }
});

describe("A-3 CSR 原生 sssp 与 dijkstra 距离一致", () => {
  for (const seed of [3, 11, 77, 500]) {
    it(`seed=${seed}`, () => {
      const { graph, ids, weight } = build(150, 700, seed);
      const start = ids[0]!;
      const reference = dijkstra(graph, start, undefined, cost);
      const c = csr(graph, weight);
      const tree = sssp(c, start);

      for (const id of graph.nodes()) {
        const idx = c.indexOf(id);
        const expected = reference.get(id)?.distance ?? Infinity;
        expect(tree.dist[idx]).toBe(expected);
      }

      // csrPath 重建的路径总权重应等于距离。
      const target = ids[ids.length - 1]!;
      const route = csrPath(c, tree, target);
      const dist = tree.dist[c.indexOf(target)]!;
      if (dist === Infinity) {
        expect(route).toEqual([]);
      } else {
        expect(route[0]).toBe(start);
        expect(route[route.length - 1]).toBe(target);
        let total = 0;
        for (let i = 0; i + 1 < route.length; i++) {
          total += weight(route[i]!, route[i + 1]!);
        }
        expect(total).toBe(dist);
      }
    });
  }
});

describe("A-4 方向优化 BFS 层级与朴素 BFS 一致", () => {
  for (const seed of [5, 23, 88]) {
    it(`seed=${seed}`, () => {
      const { graph, ids, weight } = build(300, 1500, seed);
      const c = csr(graph, weight);
      const sources = [ids[0]!, ids[1]!];
      const sourceIdx = sources.map((s) => c.indexOf(s));

      // 朴素多源 BFS 参考实现。
      const n = c.order;
      const ref = new Int32Array(n).fill(-1);
      const queue: number[] = [];
      for (const s of sourceIdx) {
        ref[s] = 0;
        queue.push(s);
      }
      for (let head = 0; head < queue.length; head++) {
        const u = queue[head]!;
        const a = c.outOffsets[u]!;
        const b = c.outOffsets[u + 1]!;
        for (let k = a; k < b; k++) {
          const v = c.outTargets[k]!;
          if (ref[v]! === -1) {
            ref[v] = ref[u]! + 1;
            queue.push(v);
          }
        }
      }

      const levels = bfsLevels(c, sources);
      expect(Array.from(levels)).toEqual(Array.from(ref));
    });
  }
});

describe("A-2 StableGraph 删除后下标稳定、空位复用", () => {
  it("drop 中间节点不移动其它下标，新增复用空位", () => {
    const { graph, ids } = build(10, 30, 13, StableGraph);
    const before = new Map<NodeId, number>();
    for (const id of ids) before.set(id, graph.indexOf(id));

    const victim = ids[4]!;
    const freed = graph.indexOf(victim);
    graph.dropNode(victim);

    // 其余节点下标不变、at() 稳定。
    for (const id of ids) {
      if (id === victim) continue;
      expect(graph.indexOf(id)).toBe(before.get(id)!);
      expect(graph.at(before.get(id)!)).toBe(id);
    }
    expect(graph.at(freed)).toBeUndefined();

    // 新增节点复用被释放的下标。
    const fresh = new Vertex("fresh" as NodeId);
    fresh.addInput("in", Socket.any);
    fresh.addOutput("out", Socket.any);
    graph.addNode(fresh);
    expect(graph.indexOf("fresh" as NodeId)).toBe(freed);
  });

  it("普通 Graph 删除会移动下标（对照）", () => {
    const { graph, ids } = build(10, 30, 13, Graph);
    const last = ids[ids.length - 1]!;
    const lastIndex = graph.indexOf(last);
    const victim = ids[4]!;
    graph.dropNode(victim);
    // swap-and-pop：末尾节点被移动到空位。
    expect(graph.indexOf(last)).not.toBe(lastIndex);
  });
});
