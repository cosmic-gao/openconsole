/**
 * 入度计算共享助手：拓扑算法与拓扑遍历器复用同一份"快/慢路径"实现。
 *
 * @internal
 */

import type { IntoDegree, NodeId, Walkable } from '../types';

/**
 * 计算每个节点的入度。
 *
 * @remarks
 * - 快路径：图实现 {@link IntoDegree} 时直接读取 (O(N))；
 * - 慢路径：扫 `outgoingNeighbors` 重建 (O(N + E))。
 *
 * 慢路径只对 `nodeIds` 中已知的节点累计；`outgoingNeighbors` 偶发返回的"孤儿"
 * 邻居（不在 `nodeIds` 拓扑空间）不计入，避免被后续 Kahn 算法误纳入。
 */
export function inDegrees<G extends Walkable & Partial<IntoDegree>>(
  graph: G,
): Map<NodeId, number> {
  const result = new Map<NodeId, number>();

  // 与 algorithms/degree.ts 同款 capability 检测（`in` 操作符，避免 duck typing）。
  if ('inDegree' in graph && typeof graph.inDegree === 'function') {
    for (const nodeId of graph.nodeIds) result.set(nodeId, graph.inDegree(nodeId));
    return result;
  }

  for (const nodeId of graph.nodeIds) result.set(nodeId, 0);
  for (const nodeId of graph.nodeIds) {
    for (const neighbor of graph.outgoingNeighbors(nodeId)) {
      const current = result.get(neighbor);
      if (current === undefined) continue;
      result.set(neighbor, current + 1);
    }
  }
  return result;
}
