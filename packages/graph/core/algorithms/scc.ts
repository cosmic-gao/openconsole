/**
 * scc：Pearce 2016 强连通分量算法（迭代 + 单 typed-array）。
 */

import type { NodeId, Walkable } from '../types';

/**
 * 强连通分量（Pearce 2016 算法，迭代 + 单 typed-array 实现）。
 *
 * @remarks
 * 相比 Tarjan 经典三数组实现（`disc` / `low` / `onStack` 共 ~9n 字节），本算法只用单个
 * `rindex: Int32Array`（~4n 字节）+ 一个 SCC 候选栈，空间约 1/2、缓存命中显著更好。
 *
 * **rindex 三态编码**（同一个 slot 三段语义复用，靠正负号区分）：
 * | 取值 | 含义 |
 * | --- | --- |
 * | `0` | 未访问 |
 * | `> 0` | 当前 DFS 子树的 lowlink（初始 = preorder；遇 back/cross 到栈上节点时被拉低） |
 * | `< 0` | 已完成，编码为 `-(component + 1)`，对应分量号 = `-rindex - 1` |
 *
 * **迭代-递归差异**：用 `pending` 字段挂在父栈帧上记下"子刚返回需要回流 low"，与 Tarjan 实现保持
 * 同款技巧。每帧额外保留 `preorder` 字段以便 SCC 根判定（`rindex[v] === preorder[v]` ⇔ root）。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @returns 各分量的节点 ID 数组；分量内按 discover 顺序排列
 *
 * @see Pearce, D.J. (2016). "A space-efficient algorithm for finding SCCs." IPL 116(1).
 * @see Tarjan, R. (1972). "Depth-first search and linear graph algorithms." SIAM J. Comput.
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

  const rindex = new Int32Array(n);
  const stack: number[] = [];
  const components: NodeId[][] = [];

  let preorder = 1;
  let component = 0;

  type Frame = {
    readonly node: number;
    /** 入栈时的 preorder，用于根判定（rindex 可能被拉低，必须独立保留）。 */
    readonly mark: number;
    readonly iter: Iterator<NodeId>;
    /** 上一轮下钻的子节点 idx；下一轮 while 顶部回流其 low 到当前 frame。 */
    pending: number;
  };
  const NONE = -1;
  const frames: Frame[] = [];

  const enter = (node: number): void => {
    const mark = preorder++;
    rindex[node] = mark;
    stack.push(node);
    frames.push({
      node,
      mark,
      iter: graph.downstream(nodes[node]!)[Symbol.iterator](),
      pending: NONE,
    });
  };

  for (let root = 0; root < n; root++) {
    if (rindex[root] !== 0) continue;
    enter(root);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;

      // 回流时只接受仍在栈上（>0）的子；已并入分量的子不再代表"可达祖先"。
      if (frame.pending !== NONE) {
        const child = frame.pending;
        frame.pending = NONE;
        const childLow = rindex[child]!;
        if (childLow > 0 && childLow < rindex[frame.node]!) {
          rindex[frame.node] = childLow;
        }
      }

      const step = frame.iter.next();
      if (!step.done) {
        const target = index.get(step.value);
        if (target === undefined) continue;        // 孤儿邻居：约定见 internal/degree.ts
        const targetRank = rindex[target]!;
        if (targetRank === 0) {
          frame.pending = target;
          enter(target);
        } else if (targetRank > 0 && targetRank < rindex[frame.node]!) {
          rindex[frame.node] = targetRank;
        }
        continue;
      }

      // root[v] ⇔ rindex[v] 仍等于入栈时 mark（从未被拉低）。
      if (rindex[frame.node] === frame.mark) {
        const member: NodeId[] = [];
        let w: number;
        do {
          w = stack.pop()!;
          rindex[w] = -(component + 1);
          member.push(nodes[w]!);
        } while (w !== frame.node);
        member.reverse();                          // LIFO 弹出 → 反转恢复 discover 序
        components.push(member);
        component++;
      }

      frames.pop();
    }
  }

  return components;
}
