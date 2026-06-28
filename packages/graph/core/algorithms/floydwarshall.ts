import type { Catalog, EdgeView, IntoEdges, NodeId } from '../types';

export function floydWarshall<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
  edgeCost: (edge: EdgeView<E>) => number,
): Map<NodeId, Map<NodeId, number>> {
  const labels: NodeId[] = [...graph.nodes()];
  const n = labels.length;
  const index = new Map<NodeId, number>();
  labels.forEach((id, i) => index.set(id, i));

  const dist: number[][] = [];
  for (let i = 0; i < n; i++) {
    dist.push(new Array<number>(n).fill(Infinity));
    dist[i]![i] = 0;
  }

  for (const edge of graph.edgeViews()) {
    const u = index.get(edge.source);
    const v = index.get(edge.target);
    if (u === undefined || v === undefined) continue;
    const cost = edgeCost(edge);
    if (cost < dist[u]![v]!) dist[u]![v] = cost;
  }

  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const through = dist[i]![k]!;
      if (through === Infinity) continue;
      for (let j = 0; j < n; j++) {
        const candidate = through + dist[k]![j]!;
        if (candidate < dist[i]![j]!) dist[i]![j] = candidate;
      }
    }
  }

  const result = new Map<NodeId, Map<NodeId, number>>();
  for (let i = 0; i < n; i++) {
    const row = new Map<NodeId, number>();
    for (let j = 0; j < n; j++) {
      if (dist[i]![j]! !== Infinity) row.set(labels[j]!, dist[i]![j]!);
    }
    result.set(labels[i]!, row);
  }
  return result;
}
