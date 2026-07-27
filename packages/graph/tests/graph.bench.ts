import { bench, describe } from "vitest";

import {
  components,
  dominators,
  kruskal,
  nodeId,
  pack,
  reduction,
  scc,
  settle,
  shortestPaths,
  Snapshot,
  toposort,
  unpack,
} from "../index";
import { cost, randomGraph, weighted } from "./support";

const graph = randomGraph(2026, { order: 5000, density: 8, acyclic: true });
const snapshot = weighted(graph);
const nodes = graph.nodes();
const source = snapshot.indexOf(nodeId("n0"));
const bundle = pack(graph);
const first = graph.edges()[0]!;
let tick = 0;

describe(`邻接遍历（V=${graph.order} E=${graph.size}）`, () => {
  bench("Graph.forEachOut 全图（零分配）", () => {
    let seen = 0;
    for (const node of nodes) graph.forEachOut(node, () => void seen++);
  });

  bench("Graph.outNeighbors 全图（每次分配数组）", () => {
    let seen = 0;
    for (const node of nodes) seen += graph.outNeighbors(node).length;
  });

  bench("Snapshot CSR 直读", () => {
    const { offset, other } = snapshot.outbound;
    let seen = 0;
    for (let u = 0; u < snapshot.order; u++) {
      for (let k = offset[u]!; k < offset[u + 1]!; k++) seen += other[k]!;
    }
  });
});

describe("快照编译", () => {
  bench("双向带权", () => {
    weighted(graph);
  });

  bench("单向带权（outbound）", () => {
    Snapshot.of(graph, { weight: cost, outbound: true });
  });

  bench("双向无权", () => {
    Snapshot.of(graph);
  });

  bench("增量重编译（只动了权重）", () => {
    graph.setEdgeWeight(first, (tick++ % 9) + 1);
    Snapshot.of(graph, { weight: cost, reuse: snapshot });
  });
});

describe("算法（同一份快照）", () => {
  bench("toposort", () => {
    settle(toposort(snapshot));
  });

  bench("scc", () => {
    settle(scc(snapshot));
  });

  bench("components", () => {
    settle(components(snapshot));
  });

  bench("shortestPaths", () => {
    settle(shortestPaths(snapshot, source));
  });

  bench("dominators", () => {
    settle(dominators(snapshot, source));
  });

  bench("kruskal", () => {
    settle(kruskal(snapshot));
  });
});

describe("传递归约（V=400，闭包位图规模敏感）", () => {
  const small = Snapshot.of(randomGraph(7, { order: 400, density: 3, acyclic: true }));

  bench("reduction", () => {
    settle(reduction(small));
  });
});

describe("序列化", () => {
  bench("pack", () => {
    pack(graph);
  });

  bench("unpack", () => {
    unpack(bundle);
  });
});
