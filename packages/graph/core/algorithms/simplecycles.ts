import type { Catalog, Neighbors, NodeId } from "../types";

/**
 * 用 Johnson 算法枚举有向图中所有简单环，每个环以节点序列返回。
 */
export function simpleCycles<G extends Catalog & Neighbors>(
  graph: G,
): NodeId[][] {
  const nodes = [...graph.nodes()];
  const index = new Map<NodeId, number>();
  nodes.forEach((id, i) => index.set(id, i));

  const result: NodeId[][] = [];
  const blocked = new Set<NodeId>();
  const noEntry = new Map<NodeId, Set<NodeId>>();
  const stack: NodeId[] = [];

  const unblock = (node: NodeId): void => {
    blocked.delete(node);
    const set = noEntry.get(node);
    if (!set) return;
    for (const blockedOn of [...set]) {
      set.delete(blockedOn);
      if (blocked.has(blockedOn)) unblock(blockedOn);
    }
  };

  const circuit = (node: NodeId, start: NodeId, min: number): boolean => {
    let found = false;
    stack.push(node);
    blocked.add(node);

    for (const next of graph.outNeighbors(node)) {
      const order = index.get(next);
      if (order === undefined || order < min) continue;
      if (next === start) {
        result.push([...stack]);
        found = true;
      } else if (!blocked.has(next)) {
        if (circuit(next, start, min)) found = true;
      }
    }

    if (found) {
      unblock(node);
    } else {
      for (const next of graph.outNeighbors(node)) {
        const order = index.get(next);
        if (order === undefined || order < min) continue;
        let set = noEntry.get(next);
        if (!set) {
          set = new Set();
          noEntry.set(next, set);
        }
        set.add(node);
      }
    }

    stack.pop();
    return found;
  };

  for (let start = 0; start < nodes.length; start++) {
    blocked.clear();
    noEntry.clear();
    circuit(nodes[start]!, nodes[start]!, start);
  }
  return result;
}
