import { bench, describe } from "vitest";

import {
  bfsLevels,
  type Catalog,
  csr,
  dijkstra,
  type EdgeView,
  type GraphId,
  Graph,
  type IntoEdges,
  type NodeId,
  Socket,
  sssp,
  Vertex,
} from "../index";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const N = 5000;
const M = 40000;
const r = rng(2026);
const graph = new Graph<unknown, number>("bench" as GraphId);
const ids: NodeId[] = [];
for (let i = 0; i < N; i++) {
  const id = `n${i}` as NodeId;
  const v = new Vertex(id);
  v.addInput("in", Socket.any);
  v.addOutput("out", Socket.any);
  graph.addNode(v);
  ids.push(id);
}
const wmap = new Map<string, number>();
const seen = new Set<string>();
for (let e = 0; e < M; e++) {
  const a = ids[Math.floor(r() * N)]!;
  const b = ids[Math.floor(r() * N)]!;
  if (a === b) continue;
  const key = `${a}->${b}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const w = 1 + Math.floor(r() * 20);
  wmap.set(key, w);
  graph.connect([a, "out"], [b, "in"], { weight: w });
}

const start = ids[0]!;
const cost = (edge: EdgeView<number>): number => edge.weight ?? 1;
const weight = (from: NodeId, to: NodeId): number => wmap.get(`${from}->${to}`) ?? 1;

// 预编译 CSR（一次），基准只测查询。
const compiled = csr(graph, weight);

// 剥去 NodeIndexable，强制通用（稀疏）路径。
const opaque: Catalog & IntoEdges<number> = {
  order: graph.order,
  size: graph.size,
  nodes: () => graph.nodes(),
  edges: () => graph.edges(),
  edgeViews: () => graph.edgeViews(),
  inEdges: (node: NodeId) => graph.inEdges(node),
  outEdges: (node: NodeId) => graph.outEdges(node),
};

describe(`dijkstra 单源最短路 (V=${N}, E≈${seen.size})`, () => {
  bench("通用路径 Map/Set 记账 (A-1 前)", () => {
    dijkstra(opaque, start, undefined, cost);
  });
  bench("稠密整数下标快路 (A-1)", () => {
    dijkstra(graph, start, undefined, cost);
  });
  bench("CSR 原生 sssp (A-1+A-3)", () => {
    sssp(compiled, start);
  });
});

describe(`BFS 层级 (V=${N}, E≈${seen.size})`, () => {
  bench("方向优化 BFS (A-4)", () => {
    bfsLevels(compiled, [start]);
  });
});
