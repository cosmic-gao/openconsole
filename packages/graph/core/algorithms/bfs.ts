/**
 * bfs：BFS 生成器。
 */

import type { Neighbors, NodeId } from '../types';

/**
 * BFS 生成器。使用游标推进队列以避免 `Array#shift` 的 O(n) 拷贝。
 *
 * @template G 实现 {@link Neighbors} 的图类型
 * @param graph 图实例
 * @param start 起始节点
 * @yields 按 BFS 顺序访问到的节点 ID
 */
export function* bfs<G extends Neighbors>(
  graph: G,
  start: NodeId,
): Generator<NodeId, void, unknown> {
  const queue: NodeId[] = [start];
  const visited = new Set<NodeId>([start]);
  let head = 0;

  while (head < queue.length) {
    const nodeId = queue[head++]!;
    yield nodeId;

    for (const neighbor of graph.outgoingNeighbors(nodeId)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
}
