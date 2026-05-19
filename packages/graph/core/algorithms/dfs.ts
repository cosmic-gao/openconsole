/**
 * dfs：DFS 生成器（迭代版，支持延迟消费）。
 */

import type { Neighbors, NodeId } from '../types';

/**
 * DFS 生成器（迭代版，支持延迟消费）。
 *
 * @template G 实现 {@link Neighbors} 的图类型
 * @param graph 图实例
 * @param start 起始节点
 * @yields 按 DFS 顺序访问到的节点 ID
 */
export function* dfs<G extends Neighbors>(
  graph: G,
  start: NodeId,
): Generator<NodeId, void, unknown> {
  const stack: NodeId[] = [start];
  const visited = new Set<NodeId>();

  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    yield nodeId;

    const neighbors = Array.from(graph.outgoingNeighbors(nodeId));
    for (let i = neighbors.length - 1; i >= 0; i--) {
      const neighbor = neighbors[i]!;
      if (!visited.has(neighbor)) stack.push(neighbor);
    }
  }
}
