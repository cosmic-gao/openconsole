import { Cycle } from "../../model";
import { enumerate } from "../../support";
import type { Catalog, EdgeView, IntoEdges, NodeId } from "../../types";

/**
 * Floyd-Warshall 全源最短路，容许负权边，返回任意两点间最短距离矩阵（不可达对省略）。
 * 复杂度 O(V³)。
 * @throws Cycle 当存在负权环时抛出。
 */
export function floydWarshall<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
  edgeCost: (edge: EdgeView<E>) => number,
): Map<NodeId, Map<NodeId, number>> {
  const { labels, index } = enumerate(graph);
  const n = labels.length;

  // 扁平 n×n 距离矩阵：typed-array 连续存储，避免 n 个数组对象与嵌套解引用。
  const dist = new Float64Array(n * n).fill(Infinity);
  for (let i = 0; i < n; i++) dist[i * n + i] = 0;

  for (const edge of graph.edgeViews()) {
    const u = index.get(edge.source);
    const v = index.get(edge.target);
    if (u === undefined || v === undefined) continue;
    const cost = edgeCost(edge);
    if (cost < dist[u * n + v]!) dist[u * n + v] = cost;
  }

  for (let k = 0; k < n; k++) {
    const kRow = k * n;
    for (let i = 0; i < n; i++) {
      const iRow = i * n;
      const through = dist[iRow + k]!;
      if (through === Infinity) continue;
      for (let j = 0; j < n; j++) {
        const candidate = through + dist[kRow + j]!;
        if (candidate < dist[iRow + j]!) dist[iRow + j] = candidate;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (dist[i * n + i]! < 0) throw new Cycle([labels[i]!]);
  }

  const result = new Map<NodeId, Map<NodeId, number>>();
  for (let i = 0; i < n; i++) {
    const iRow = i * n;
    const row = new Map<NodeId, number>();
    for (let j = 0; j < n; j++) {
      const value = dist[iRow + j]!;
      if (value !== Infinity) row.set(labels[j]!, value);
    }
    result.set(labels[i]!, row);
  }
  return result;
}
