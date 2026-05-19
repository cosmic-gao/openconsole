/**
 * 可达性家族：reachable / ancestors / descendants。
 */

import type { Neighbors, NodeId, Walkable } from '../types';
import { reversed } from '../adapters';
import { dfs } from './dfs';

/**
 * `source` 是否能到达 `target`。
 *
 * @template G 实现 {@link Neighbors} 的图类型
 * @param graph 图实例
 * @param source 起点节点 ID
 * @param target 终点节点 ID
 * @returns 是否可达
 */
export function reachable<G extends Neighbors>(
  graph: G,
  source: NodeId,
  target: NodeId,
): boolean {
  if (source === target) return true;

  const visited = new Set<NodeId>();
  const stack: NodeId[] = [source];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const neighbor of graph.outgoingNeighbors(current)) {
      if (!visited.has(neighbor)) stack.push(neighbor);
    }
  }

  return false;
}

/**
 * 收集 `node` 的全部祖先（沿入边可达的节点，不含 `node` 本身）。
 *
 * @remarks 在 {@link reversed} 视图上跑 DFS 复用同一份遍历算法。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @param node 起点
 */
export function ancestors<G extends Walkable>(graph: G, node: NodeId): NodeId[] {
  const iter = dfs(reversed(graph), node);
  iter.next(); // DFS 先 yield 起点本身，这里丢弃
  return [...iter];
}

/**
 * 收集 `node` 的全部后代（沿出边可达的节点，不含 `node` 本身）。
 *
 * @template G 实现 {@link Neighbors} 的图类型
 * @param graph 图实例
 * @param node 起点
 */
export function descendants<G extends Neighbors>(graph: G, node: NodeId): NodeId[] {
  const iter = dfs(graph, node);
  iter.next(); // DFS 先 yield 起点本身，这里丢弃
  return [...iter];
}
