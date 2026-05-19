/**
 * kosaraju：Kosaraju 强连通分量算法。
 */

import type { Catalog, Neighbors, NodeId } from '../types';
import { reversed } from '../adapters';
import { postorder } from './postorder';

/**
 * Kosaraju 算法求强连通分量，与 {@link scc} 互为参照实现。
 *
 * @remarks
 * 流程：
 * 1. 在原图上跑 DFS，按 finish-time 收集后序栈；
 * 2. 在 {@link reversed} 视图上按 1) 的逆序跑 DFS；每棵 DFS 树即一个强连通分量。
 *
 * @template G 实现 {@link Catalog} + {@link Neighbors} 的图类型
 * @param graph 图实例
 * @returns 各分量的节点 ID 数组
 */
export function kosaraju<G extends Catalog & Neighbors>(graph: G): NodeId[][] {
  const order = postorder(graph);
  const reversedGraph = reversed(graph);
  const components: NodeId[][] = [];
  const visited = new Set<NodeId>();

  // 内联 DFS 以共享外层 `visited`，否则每次调用 `dfs(reversedGraph, root)`
  // 都会在已分配分量的节点上重新走一遍，把整体复杂度从 O(V+E) 抬到 O(V·E)。
  const stack: NodeId[] = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const root = order[i]!;
    if (visited.has(root)) continue;
    const component: NodeId[] = [];
    stack.length = 0;
    stack.push(root);
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      component.push(node);
      for (const neighbor of reversedGraph.outgoingNeighbors(node)) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }
    if (component.length > 0) components.push(component);
  }
  return components;
}
