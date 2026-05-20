/**
 * dijkstra：单源最短路径（非负权重，配对堆 + 真 decrease-key）。
 */

import { PairingHeap, type PairingNode } from '@opendesign/heap';

import type { Catalog, EdgeView, IntoEdges, NodeId } from '../types';

/** 堆中的待处理项：节点 + 距起点距离。 */
interface Entry {
  readonly node: NodeId;
  readonly dist: number;
}

/**
 * Dijkstra 单源最短路径（非负权重）。
 *
 * @remarks
 * 用 {@link PairingHeap} 配合稳定句柄 {@link PairingNode} 提供 O(1) 摊销 decrease-key：
 * 每个节点在堆中至多一份，relax 命中触发 `update` 而非重复入堆。
 *
 * 不支持负权边；`edgeCost` 返回负数时立即抛错而不是静默给出错误答案。
 *
 * @template E 边权重类型
 * @template G 满足 {@link Catalog} + {@link IntoEdges} 的图类型
 * @param graph 图实例
 * @param start 起点
 * @param end 提前终止的目标节点；传 `undefined` 计算到所有可达节点的距离
 * @param edgeCost 边代价函数，必须返回非负数
 * @returns 节点 ID → 从 `start` 出发的最短距离；不可达节点不出现在 Map 中
 * @throws {Error} `edgeCost` 返回负数时
 */
export function dijkstra<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
  start: NodeId,
  end: NodeId | undefined,
  edgeCost: (edge: EdgeView<E>) => number,
): Map<NodeId, number> {
  const distances = new Map<NodeId, number>();
  const handles = new Map<NodeId, PairingNode<Entry>>();
  const visited = new Set<NodeId>();
  const heap = new PairingHeap<Entry>((a, b) => a.dist - b.dist);

  distances.set(start, 0);
  handles.set(start, heap.push({ node: start, dist: 0 }));

  while (!heap.empty()) {
    const entry = heap.poll()!;
    const node = entry.node;
    handles.delete(node);
    visited.add(node);
    if (node === end) break;

    for (const edge of graph.getOutgoing(node)) {
      if (visited.has(edge.target)) continue;
      const cost = edgeCost(edge);
      if (cost < 0) {
        throw new Error(
          `dijkstra: negative edge cost ${cost} on edge "${String(edge.id)}"; use Bellman-Ford for negative weights.`,
        );
      }
      const candidate = entry.dist + cost;
      const handle = handles.get(edge.target);
      if (handle !== undefined) {
        if (candidate < handle.value.dist) {
          heap.update(handle, { node: edge.target, dist: candidate });
          distances.set(edge.target, candidate);
        }
      } else {
        distances.set(edge.target, candidate);
        handles.set(edge.target, heap.push({ node: edge.target, dist: candidate }));
      }
    }
  }

  return distances;
}
