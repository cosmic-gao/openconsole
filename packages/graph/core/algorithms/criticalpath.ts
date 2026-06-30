import type { Catalog, EdgeView, IntoEdges, Neighbors, NodeId } from "../types";
import { toposort } from "./toposort";

/**
 * DAG 关键路径（最长路）：按拓扑序求权值之和最大的路径。
 * 仅适用于有向无环图。
 * @returns 关键路径节点序列及其总长度。
 */
export function criticalPath<E, G extends Catalog & Neighbors & IntoEdges<E>>(
  graph: G,
  edgeCost: (edge: EdgeView<E>) => number,
): { path: NodeId[]; length: number } {
  const order = toposort(graph);
  const dist = new Map<NodeId, number>();
  const prev = new Map<NodeId, NodeId>();
  let best = 0;
  let end: NodeId | undefined;

  for (const node of order) {
    const base = dist.get(node) ?? 0;
    if (base > best) {
      best = base;
      end = node;
    }
    for (const edge of graph.outEdges(node)) {
      const candidate = base + edgeCost(edge);
      if (candidate > (dist.get(edge.target) ?? 0)) {
        dist.set(edge.target, candidate);
        prev.set(edge.target, node);
      }
    }
  }

  const path: NodeId[] = [];
  let cursor = end;
  while (cursor !== undefined) {
    path.push(cursor);
    cursor = prev.get(cursor);
  }
  return { path: path.reverse(), length: best };
}
