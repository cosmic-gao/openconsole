/**
 * scc：Tarjan 强连通分量算法（迭代实现，避免深图栈溢出）。
 */

import type { NodeId, Walkable } from '../types';

/**
 * 强连通分量（Tarjan 算法，迭代实现避免深图栈溢出）。
 *
 * @remarks
 * 经典递归 Tarjan 在深图上会爆栈，这里用显式栈模拟递归。状态机要点：
 *
 * - `callStack`：模拟函数调用栈，每帧 `{nodeId, neighbors, pendingChild}` 表示
 *   "正在处理 `nodeId`、待遍历的邻居迭代器、上一次递归调用的子节点"。
 * - `tarjanStack` + `onStack`：经典 Tarjan 的辅助栈，跟踪当前 SCC 候选成员。
 * - **`pendingChild` 字段是迭代版的关键**：递归版在子调用返回后能立刻用子的
 *   `lowlink` 更新自身，但迭代版需要在"再次回到父帧"时才能做这件事 — 因此把
 *   即将进入的子节点记在 `pendingChild`，下一轮 while 循环开头读到它就更新
 *   `lowlink(parent) = min(lowlink(parent), lowlink(child))`。
 * - 当 `lowlink(node) === index(node)` 且邻居耗尽时，从 `tarjanStack` 弹栈直到
 *   弹出 `node` 自身，这串元素就是一个分量。
 *
 * 分量内节点顺序：按 **DFS discover 顺序**（reverse 弹栈结果）。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @returns 各分量的节点 ID 数组；分量内按 discover 顺序排列
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
        // Tarjan 弹栈顺序是 LIFO（晚发现的节点先出），reverse 后还原为 discover 顺序。
        component.reverse();
        components.push(component);
      }

      callStack.pop();
    }
  }

  return components;
}
