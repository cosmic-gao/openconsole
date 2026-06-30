import type { Catalog, Neighbors, NodeId } from "../types";
import { descendants } from "./reachable";

/**
 * 计算传递闭包，返回每个节点到其全部可达节点集合的映射。
 */
export function transitiveClosure<G extends Catalog & Neighbors>(
  graph: G,
): Map<NodeId, Set<NodeId>> {
  const result = new Map<NodeId, Set<NodeId>>();
  for (const node of graph.nodes()) {
    result.set(node, new Set(descendants(graph, node)));
  }
  return result;
}

/**
 * 计算传递归约，去除可由其他路径间接到达的冗余边，返回保留的边列表。
 */
export function transitiveReduction<G extends Catalog & Neighbors>(
  graph: G,
): Array<[NodeId, NodeId]> {
  const closure = transitiveClosure(graph);
  const kept: Array<[NodeId, NodeId]> = [];
  for (const source of graph.nodes()) {
    const targets = [...new Set(graph.outNeighbors(source))];
    for (const target of targets) {
      let redundant = false;
      for (const other of targets) {
        if (other === target) continue;
        if (closure.get(other)?.has(target)) {
          redundant = true;
          break;
        }
      }
      if (!redundant) kept.push([source, target]);
    }
  }
  return kept;
}
