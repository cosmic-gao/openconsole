/**
 * neighborhood：一次性快照所有节点的邻域（前驱 + 后继）。
 */

import type { Catalog, Neighbors, NodeId } from '../types';

/**
 * 一次性快照所有节点的邻域（前驱 + 后继）。
 *
 * @remarks
 * 仅遍历 `outgoingNeighbors` 一次即可同步推出 `predecessors`，
 * 适用于只暴露出边却需要双向访问的图实现。注意这会一次性物化双向邻接表，
 * 不是零成本的边翻转视图；如需零成本视图请使用 {@link reversed}。
 *
 * @template G 满足 {@link Catalog} + {@link Neighbors} 的图类型；
 *   不需要节点 / 边权重，因此不再带 N / E 泛型。
 * @param graph 图实例
 * @returns 节点 ID → `{ predecessors, successors }`
 */
export function neighborhood<G extends Catalog & Neighbors>(
  graph: G,
): Map<NodeId, { predecessors: NodeId[]; successors: NodeId[] }> {
  const result = new Map<NodeId, { predecessors: NodeId[]; successors: NodeId[] }>();

  for (const nodeId of graph.nodeIds) {
    result.set(nodeId, { predecessors: [], successors: [] });
  }

  for (const nodeId of graph.nodeIds) {
    const info = result.get(nodeId)!;
    for (const succ of graph.outgoingNeighbors(nodeId)) {
      info.successors.push(succ);
      const succEntry = result.get(succ);
      if (succEntry) succEntry.predecessors.push(nodeId);
    }
  }

  return result;
}
