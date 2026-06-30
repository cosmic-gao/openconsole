import { reversed } from "../adapters";
import type { Neighbors, NodeId, Walkable } from "../types";
import { dfs } from "./dfs";

/**
 * 判断从 source 是否可达 target，采用双向 BFS 加速搜索。
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
        for (const neighbor of graph.outNeighbors(node)) {
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
        for (const neighbor of graph.inNeighbors(node)) {
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
 * 返回 node 的所有祖先节点（在反图上 DFS，不含自身）。
 */
export function ancestors<G extends Walkable>(
  graph: G,
  node: NodeId,
): NodeId[] {
  const iterator = dfs(reversed(graph), node);
  iterator.next();
  return [...iterator];
}

/**
 * 返回 node 的所有后代节点（沿出边 DFS，不含自身）。
 */
export function descendants<G extends Neighbors>(
  graph: G,
  node: NodeId,
): NodeId[] {
  const iterator = dfs(graph, node);
  iterator.next();
  return [...iterator];
}
