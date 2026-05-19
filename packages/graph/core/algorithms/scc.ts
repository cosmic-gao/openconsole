/**
 * scc：Tarjan 强连通分量算法（迭代实现，避免深图栈溢出）。
 */

import type { NodeId, Walkable } from '../types';

/**
 * 强连通分量 (Tarjan 算法，迭代实现避免深图栈溢出)。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @returns 各分量的节点 ID 数组
 */
export function scc<G extends Walkable>(graph: G): NodeId[][] {
  const index = new Map<NodeId, number>();
  const lowlink = new Map<NodeId, number>();
  const onStack = new Set<NodeId>();
  const tarjanStack: NodeId[] = [];
  const components: NodeId[][] = [];
  let counter = 0;

  type Frame = { nodeId: NodeId; neighbors: Iterator<NodeId>; pendingChild: NodeId | null };
  const callStack: Frame[] = [];

  const enter = (nodeId: NodeId): void => {
    index.set(nodeId, counter);
    lowlink.set(nodeId, counter);
    counter++;
    tarjanStack.push(nodeId);
    onStack.add(nodeId);
    callStack.push({
      nodeId,
      neighbors: graph.outgoingNeighbors(nodeId)[Symbol.iterator](),
      pendingChild: null,
    });
  };

  for (const root of graph.nodeIds) {
    if (index.has(root)) continue;
    enter(root);

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1]!;

      if (frame.pendingChild !== null) {
        const child = frame.pendingChild;
        frame.pendingChild = null;
        lowlink.set(frame.nodeId, Math.min(lowlink.get(frame.nodeId)!, lowlink.get(child)!));
      }

      const next = frame.neighbors.next();
      if (!next.done) {
        const neighbor = next.value;
        if (!index.has(neighbor)) {
          frame.pendingChild = neighbor;
          enter(neighbor);
        } else if (onStack.has(neighbor)) {
          lowlink.set(
            frame.nodeId,
            Math.min(lowlink.get(frame.nodeId)!, index.get(neighbor)!),
          );
        }
        continue;
      }

      if (lowlink.get(frame.nodeId) === index.get(frame.nodeId)) {
        const component: NodeId[] = [];
        let popped: NodeId | undefined;
        do {
          popped = tarjanStack.pop();
          if (popped !== undefined) {
            onStack.delete(popped);
            component.push(popped);
          }
        } while (popped !== undefined && popped !== frame.nodeId);
        components.push(component.reverse());
      }

      callStack.pop();
    }
  }

  return components;
}
