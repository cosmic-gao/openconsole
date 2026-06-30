import { Cycle } from "../classic";
import type { Catalog, EdgeView, IntoEdges, NodeId } from "../types";
import type { Path } from "./dijkstra";

/**
 * Bellman-Ford 单源最短路，容许负权边，返回从 start 出发的最短路径树。
 * 复杂度 O(V·E)；可配 {@link path} 重建路径。
 * @throws Cycle 当从 start 可达负权环时抛出。
 */
export function bellmanFord<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
  start: NodeId,
  edgeCost: (edge: EdgeView<E>) => number,
): Map<NodeId, Path> {
  const result = new Map<NodeId, Path>();
  result.set(start, { distance: 0, predecessor: undefined });

  for (let i = 0; i < graph.order - 1; i++) {
    let changed = false;
    for (const edge of graph.edgeViews()) {
      const from = result.get(edge.source);
      if (from === undefined) continue;
      const candidate = from.distance + edgeCost(edge);
      const to = result.get(edge.target);
      if (to === undefined || candidate < to.distance) {
        result.set(edge.target, {
          distance: candidate,
          predecessor: edge.source,
        });
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const edge of graph.edgeViews()) {
    const from = result.get(edge.source);
    if (from === undefined) continue;
    const to = result.get(edge.target);
    if (from.distance + edgeCost(edge) < (to?.distance ?? Infinity)) {
      throw new Cycle(traceCycle(result, edge.target));
    }
  }

  return result;
}

function traceCycle(tree: ReadonlyMap<NodeId, Path>, start: NodeId): NodeId[] {
  let cursor = start;
  for (let i = 0; i < tree.size; i++) {
    const predecessor = tree.get(cursor)?.predecessor;
    if (predecessor === undefined) break;
    cursor = predecessor;
  }
  const cycle: NodeId[] = [cursor];
  let walk = tree.get(cursor)?.predecessor;
  while (walk !== undefined && walk !== cursor) {
    cycle.push(walk);
    walk = tree.get(walk)?.predecessor;
  }
  return cycle.reverse();
}
