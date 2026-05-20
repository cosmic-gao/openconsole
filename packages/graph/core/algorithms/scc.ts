/**
 * scc：Tarjan 强连通分量算法（迭代 + typed-array）。
 */

import type { NodeId, Walkable } from '../types';

/**
 * 强连通分量（Tarjan 算法，迭代 + typed-array 实现）。
 *
 * @remarks
 * 状态机要点：`pending` 字段解决"子调用返回后才能更新父 `low`"的迭代-递归差异——
 * 递归版在子帧返回时立刻 `low(parent) = min(low(parent), low(child))`，迭代版必须
 * 等下一轮 while 回到父帧才能做这件事，所以把待回流的子节点 idx 记在父帧上。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @returns 各分量的节点 ID 数组；分量内按 discover 顺序排列
 *
 * @see Tarjan, R. (1972). "Depth-first search and linear graph algorithms." SIAM J. Comput.
 * @see Pearce, D.J. (2016). "A space-efficient algorithm for finding SCCs." IPL 116(1).
 * @see Tarjan, R. & Zwick, U. (2024). "Finding strong components using DFS." EJC 119.
 */
export function scc<G extends Walkable>(graph: G): NodeId[][] {
  const nodes: NodeId[] = [];
  const index = new Map<NodeId, number>();
  for (const id of graph.nodeIds) {
    if (!index.has(id)) {
      index.set(id, nodes.length);
      nodes.push(id);
    }
  }
  const n = nodes.length;

  const UNVISITED = -1;
  const disc = new Int32Array(n).fill(UNVISITED);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  const components: NodeId[][] = [];
  let counter = 0;

  type Frame = { node: number; iter: Iterator<NodeId>; pending: number };
  const NONE = -1;
  const frames: Frame[] = [];

  const enter = (node: number): void => {
    disc[node] = counter;
    low[node] = counter;
    counter++;
    stack.push(node);
    onStack[node] = 1;
    frames.push({
      node,
      iter: graph.downstream(nodes[node]!)[Symbol.iterator](),
      pending: NONE,
    });
  };

  for (let root = 0; root < n; root++) {
    if (disc[root] !== UNVISITED) continue;
    enter(root);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;

      if (frame.pending !== NONE) {
        const child = frame.pending;
        frame.pending = NONE;
        const childLow = low[child]!;
        if (childLow < low[frame.node]!) low[frame.node] = childLow;
      }

      const step = frame.iter.next();
      if (!step.done) {
        const target = index.get(step.value);
        // 边指向 nodeIds 之外的孤儿节点：静默跳过（同 internal/degree.ts 约定）。
        if (target === undefined) continue;
        if (disc[target] === UNVISITED) {
          frame.pending = target;
          enter(target);
        } else if (onStack[target] === 1) {
          const d = disc[target]!;
          if (d < low[frame.node]!) low[frame.node] = d;
        }
        continue;
      }

      if (low[frame.node] === disc[frame.node]) {
        const component: NodeId[] = [];
        let popped: number;
        do {
          popped = stack.pop()!;
          onStack[popped] = 0;
          component.push(nodes[popped]!);
        } while (popped !== frame.node);
        // stack 弹出是 LIFO（晚发现的先出），reverse 还原 discover 顺序。
        component.reverse();
        components.push(component);
      }

      frames.pop();
    }
  }

  return components;
}
