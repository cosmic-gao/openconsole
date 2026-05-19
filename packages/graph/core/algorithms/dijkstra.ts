/**
 * dijkstra：单源最短路径（非负权重，二叉堆优化）。
 */

import type {
  Catalog,
  EdgeView,
  IntoEdgeViews,
  NodeId,
} from '../types';
import { BinaryHeap } from '../internal/heap';

/** 堆中的待处理项：节点 + 距起点距离。 */
interface DijkstraEntry {
  readonly node: NodeId;
  readonly dist: number;
}

/**
 * Dijkstra 单源最短路径（非负权重）。
 *
 * @remarks
 * - 仅依赖 {@link IntoEdgeViews}，与具体存储解耦；
 * - 使用二叉最小堆，复杂度 O((V+E) log V)；
 * - 采用 lazy decrease-key：发现更短路径时重新入堆，pop 时跳过过期条目；
 * - 返回 `start` 到所有可达节点的最短距离；可选 `end` 提前终止；
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
  const heap = new BinaryHeap<DijkstraEntry>((a, b) => a.dist - b.dist);

  distances.set(start, 0);
  heap.push({ node: start, dist: 0 });

  while (!heap.isEmpty) {
    const { node: current, dist } = heap.pop()!;
    // 过期条目（之前 push 时记录的 dist > 当前已确认的最短）— 跳过
    if (visited.has(current)) continue;
    // 安全检查：dist 与 distances 中记录不同 — 也是过期条目
    if (distances.get(current) !== dist) continue;
    visited.add(current);
    if (current === end) break;

    for (const edge of graph.getOutgoingEdges(current)) {
      if (visited.has(edge.target)) continue;
      const candidate = dist + edgeCost(edge);
      const recorded = distances.get(edge.target) ?? Infinity;
      if (candidate < recorded) {
        distances.set(edge.target, candidate);
        heap.push({ node: edge.target, dist: candidate });
      }
    }
  }

  return distances;
}
