import { Cycle } from "../classic";
import { inDegrees } from "../internal";
import type { IntoDegree, NodeId, Walkable } from "../types";

/**
 * 拓扑分层（基于 Kahn 算法），同一层的节点互无依赖、可并行处理。
 * 存在环时抛出 Cycle。
 */
export function generations<G extends Walkable & Partial<IntoDegree>>(
  graph: G,
): NodeId[][] {
  const pending = inDegrees(graph);
  let frontier: NodeId[] = [];
  for (const [node, degree] of pending) {
    if (degree === 0) frontier.push(node);
  }

  const layers: NodeId[][] = [];
  let emitted = 0;
  while (frontier.length > 0) {
    layers.push(frontier);
    const next: NodeId[] = [];
    for (const node of frontier) {
      emitted++;
      for (const neighbor of graph.outNeighbors(node)) {
        const degree = pending.get(neighbor);
        if (degree === undefined) continue;
        const remaining = degree - 1;
        pending.set(neighbor, remaining);
        if (remaining === 0) next.push(neighbor);
      }
    }
    frontier = next;
  }

  if (emitted < pending.size) {
    const remaining: NodeId[] = [];
    for (const [node, degree] of pending) {
      if (degree > 0) remaining.push(node);
    }
    throw new Cycle(remaining);
  }
  return layers;
}
