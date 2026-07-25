import { bench, describe } from "vitest";

import {
  components,
  nodeId,
  scc,
  settle,
  shortestPaths,
  Snapshot,
  toposort,
  type EdgeRecord,
} from "../index";
import { randomGraph } from "./random";

const graph = randomGraph(2026, { order: 5000, density: 8, acyclic: true });
const cost = (edge: EdgeRecord<number>): number => edge.weight ?? 1;
const snapshot = Snapshot.of(graph, { weight: cost });
const nodes = graph.nodes();
const source = nodeId("n0");

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
    Snapshot.of(graph, { weight: cost });
  });

  bench("单向带权（outbound）", () => {
    Snapshot.of(graph, { weight: cost, outbound: true });
  });

  bench("双向无权", () => {
    Snapshot.of(graph);
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
});
