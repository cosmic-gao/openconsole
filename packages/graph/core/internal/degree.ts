import type { IntoDegree, NodeId, Walkable } from "../types";

export function inDegrees<G extends Walkable & Partial<IntoDegree>>(
  graph: G,
): Map<NodeId, number> {
  const result = new Map<NodeId, number>();

  if ("inDegree" in graph && typeof graph.inDegree === "function") {
    for (const node of graph.nodes()) result.set(node, graph.inDegree(node));
    return result;
  }

  for (const node of graph.nodes()) result.set(node, 0);
  for (const node of graph.nodes()) {
    for (const neighbor of graph.outNeighbors(node)) {
      const current = result.get(neighbor);
      if (current === undefined) continue;
      result.set(neighbor, current + 1);
    }
  }
  return result;
}
