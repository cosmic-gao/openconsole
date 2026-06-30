import type { Catalog, Hierarchy, NodeId } from "../types";

/**
 * 返回复合图中的所有根节点（无父节点的节点）。
 */
export function roots<G extends Catalog & Hierarchy>(graph: G): NodeId[] {
  const result: NodeId[] = [];
  for (const node of graph.nodes()) {
    if (graph.parent(node) === undefined) result.push(node);
  }
  return result;
}

/**
 * 返回以 root 为根的子树全部节点（含 root，按深度优先遍历）。
 */
export function subtree<G extends Hierarchy>(graph: G, root: NodeId): NodeId[] {
  const result: NodeId[] = [];
  const stack: NodeId[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node);
    for (const child of graph.children(node)) stack.push(child);
  }
  return result;
}

/**
 * 返回 node 自底向上的祖先链（从父节点直到根，不含自身）。
 */
export function ancestry<G extends Hierarchy>(
  graph: G,
  node: NodeId,
): NodeId[] {
  const result: NodeId[] = [];
  let cursor = graph.parent(node);
  while (cursor !== undefined) {
    result.push(cursor);
    cursor = graph.parent(cursor);
  }
  return result;
}
