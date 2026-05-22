/**
 * dijkstra：单源最短路径（非负权重，配对堆 + 真 decrease-key）。
 */

import { PairingHeap, type PairingNode } from '@openconsole/heap';

import { Negative } from '../classic';
import type { Catalog, EdgeView, IntoEdges, NodeId } from '../types';

/**
 * 堆中的待处理项：到达某节点的"已知最短距离"快照。
 *
 * @remarks 命名取自图论的 reach（可达 + 距离）—— 一次 reach 表示
 *   "节点 v 当前最好的已知到达代价是 dist"。比 `Entry` 更点题。
 */
interface Reach {
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
 * @throws {Negative} `edgeCost` 返回负数时
 */
export function dijkstra<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
  start: NodeId,
  end: NodeId | undefined,
  edgeCost: (edge: EdgeView<E>) => number,
): Map<NodeId, number> {
  // ─── 状态：三张表 + 一个堆 ──────────────────────────────────
  // distances：节点 → 已知最短距离（可能在堆里还会被进一步松弛）
  // handles  ：节点 → 堆中该节点的句柄（真 decrease-key 的关键）
  // visited  ：已 settle 的节点（弹出堆后不会再松弛）
  // heap     ：按 dist 升序的优先队列；PairingHeap 提供 O(1) 摊销 decrease-key
  const distances = new Map<NodeId, number>();
  const handles = new Map<NodeId, PairingNode<Reach>>();
  const visited = new Set<NodeId>();
  const heap = new PairingHeap<Reach>((a, b) => a.dist - b.dist);

  // 起点 dist = 0，入堆
  distances.set(start, 0);
  handles.set(start, heap.push({ node: start, dist: 0 }));

  while (!heap.empty()) {
    // ─── 取距离最小的未 settle 节点 ─────────────────────────
    const reach = heap.poll()!;
    const node = reach.node;
    handles.delete(node);
    visited.add(node);

    // 单源单汇：摸到终点提前结束（其余节点距离仍部分有效，但可能未最终化）
    if (node === end) break;

    // ─── relax 每条出边 ─────────────────────────────────────
    for (const edge of graph.getOutgoing(node)) {
      if (visited.has(edge.target)) continue;        // 已 settle 的不再松弛
      const cost = edgeCost(edge);
      if (cost < 0) throw new Negative(cost, edge.id);
      const candidate = reach.dist + cost;

      const handle = handles.get(edge.target);
      if (handle !== undefined) {
        // 目标已在堆中：若新距离更短，做 decrease-key（O(1) 摊销）
        // 而不是重复入堆 + 弹出时跳过过期项的 lazy 模式
        if (candidate < handle.value.dist) {
          heap.update(handle, { node: edge.target, dist: candidate });
          distances.set(edge.target, candidate);
        }
      } else {
        // 目标首次访问：入堆并记录句柄
        distances.set(edge.target, candidate);
        handles.set(edge.target, heap.push({ node: edge.target, dist: candidate }));
      }
    }
  }

  return distances;
}
