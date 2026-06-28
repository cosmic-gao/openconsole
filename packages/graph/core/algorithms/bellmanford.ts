import { Cycle } from '../classic';
import type { Catalog, EdgeView, IntoEdges, NodeId } from '../types';
import type { Path } from './dijkstra';

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
        result.set(edge.target, { distance: candidate, predecessor: edge.source });
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
      throw new Cycle([edge.source, edge.target]);
    }
  }

  return result;
}
