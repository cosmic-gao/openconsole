/**
 * 可达性家族：reachable / ancestors / descendants。
 */

import type { Neighbors, NodeId, Walkable } from '../types';
import { reversed } from '../adapters';
import { dfs } from './dfs';

/**
 * `source` 是否能到达 `target`（双向 BFS，meet-in-middle）。
 *
 * @remarks
 * 每轮挑较小的前沿前进——这是分支因子不对称时避免一侧爆炸的关键。
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

  const forward = new Set<NodeId>([source]);
  const backward = new Set<NodeId>([target]);
  let forwardFrontier: NodeId[] = [source];
  let backwardFrontier: NodeId[] = [target];

  while (forwardFrontier.length > 0 && backwardFrontier.length > 0) {
    if (forwardFrontier.length <= backwardFrontier.length) {
      const next: NodeId[] = [];
      for (const node of forwardFrontier) {
        for (const neighbor of graph.downstream(node)) {
          if (backward.has(neighbor)) return true;
          if (forward.has(neighbor)) continue;
          forward.add(neighbor);
          next.push(neighbor);
        }
      }
      forwardFrontier = next;
    } else {
      const next: NodeId[] = [];
      for (const node of backwardFrontier) {
        for (const neighbor of graph.upstream(node)) {
          if (forward.has(neighbor)) return true;
          if (backward.has(neighbor)) continue;
          backward.add(neighbor);
          next.push(neighbor);
        }
      }
      backwardFrontier = next;
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
  const iterator = dfs(reversed(graph), node);
  iterator.next(); // DFS 先 yield 起点本身，这里丢弃
  return [...iterator];
}

/**
 * 收集 `node` 的全部后代（沿出边可达的节点，不含 `node` 本身）。
 *
 * @template G 实现 {@link Neighbors} 的图类型
 * @param graph 图实例
 * @param node 起点
 */
export function descendants<G extends Neighbors>(graph: G, node: NodeId): NodeId[] {
  const iterator = dfs(graph, node);
  iterator.next(); // DFS 先 yield 起点本身，这里丢弃
  return [...iterator];
}
