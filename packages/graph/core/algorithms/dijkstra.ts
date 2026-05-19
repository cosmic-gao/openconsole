/**
 * dijkstra：单源最短路径（非负权重）。
 */

import type {
  Catalog,
  EdgeView,
  IntoEdgeViews,
  NodeId,
} from '../types';

/**
 * Dijkstra 单源最短路径（非负权重）。
 *
 * @remarks
 * - 仅依赖 {@link IntoEdgeViews}，与具体存储解耦；
 * - 返回 `start` 到所有可达节点的最短距离；可选 `end` 提前终止；
 * - 当前实现为 O(V²) 线性扫描（无堆），节点规模较大且性能敏感时再上二叉堆；
 * - 不支持负权边；若 `edgeCost` 返回负数行为未定义。
 *
 * @template E 边权重类型
 * @template G 满足 {@link Catalog} + {@link IntoEdgeViews}<E> 的图类型
 * @param graph 图实例
 * @param start 起点
 * @param end 提前终止的目标节点；传 `undefined` 计算到所有可达节点的距离
 * @param edgeCost 边代价函数，接收 {@link EdgeView} 返回非负数
 * @returns 节点 ID → 从 `start` 出发的最短距离；不可达节点不出现在 Map 中
 */
export function dijkstra<E, G extends Catalog & IntoEdgeViews<E>>(
  graph: G,
  start: NodeId,
  end: NodeId | undefined,
  edgeCost: (edge: EdgeView<E>) => number,
): Map<NodeId, number> {
  const distances = new Map<NodeId, number>();
  const visited = new Set<NodeId>();
  distances.set(start, 0);

  while (true) {
    let current: NodeId | undefined;
    let smallest = Infinity;
    for (const [node, dist] of distances) {
      if (visited.has(node)) continue;
      if (dist < smallest) {
        smallest = dist;
        current = node;
      }
    }
    if (current === undefined) break;
    visited.add(current);
    if (current === end) break;

    for (const edge of graph.getOutgoingEdges(current)) {
      if (visited.has(edge.target)) continue;
      const candidate = smallest + edgeCost(edge);
      const recorded = distances.get(edge.target) ?? Infinity;
      if (candidate < recorded) distances.set(edge.target, candidate);
    }
  }

  return distances;
}
