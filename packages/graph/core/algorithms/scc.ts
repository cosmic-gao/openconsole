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
  // ─── 步骤 1：节点编号 ─────────────────────────────────────────
  // 把 NodeId 映射成连续整数 [0, n)，后续所有状态用 typed-array 索引而非 Map.get，
  // 一来节省内存，二来 V8 对 typed-array 下标访问优化更好。
  const nodes: NodeId[] = [];
  const index = new Map<NodeId, number>();
  for (const id of graph.nodeIds) {
    if (!index.has(id)) {
      index.set(id, nodes.length);
      nodes.push(id);
    }
  }
  const n = nodes.length;

  // ─── 步骤 2：状态容器 ─────────────────────────────────────────
  // rindex 是 Pearce 算法的核心 —— 单数组承载三种状态（0/正/负），见函数 JSDoc。
  // stack 是 SCC 候选栈：节点 enter 时入栈，根判定时把整段弹出形成一个 SCC。
  const rindex = new Int32Array(n);
  const stack: number[] = [];
  const components: NodeId[][] = [];

  // preorder 从 1 开始（让 0 保留作"未访问"哨兵）。component 从 0 计数。
  let preorder = 1;
  let component = 0;

  type Frame = {
    readonly node: number;
    /** 入栈时的 preorder。根判定需要原始值，rindex 可能被后向边拉低，必须独立保留。 */
    readonly mark: number;
    readonly iterator: Iterator<NodeId>;
    /**
     * 上一轮下钻的子节点 index。
     *
     * 迭代实现的关键 trick：递归版本在子调用 return 后 *立刻* 把
     * `low(parent) = min(low(parent), low(child))` 算出来；而迭代版本必须等下一轮
     * while 回到父帧时才能做这件事，所以用 pending 字段挂个标记。
     */
    pending: number;
  };
  const NONE = -1;
  const frames: Frame[] = [];

  // 把节点压入 DFS 栈、分配新 preorder、推入候选栈。
  const enter = (node: number): void => {
    const mark = preorder++;
    rindex[node] = mark;
    stack.push(node);
    frames.push({
      node,
      mark,
      iterator: graph.downstream(nodes[node]!)[Symbol.iterator](),
      pending: NONE,
    });
  };

  // ─── 步骤 3：主循环 ──────────────────────────────────────────
  // 外层 for 选下一个未访问根（孤立子图也能覆盖）；内层 while 是迭代 DFS。
  for (let root = 0; root < n; root++) {
    if (rindex[root] !== 0) continue;
    enter(root);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;

      // ─── 3a：回流子帧的 low ──────────────────────────────────
      // 上一轮我们 enter 了一个 child（frame.pending 记录它）。child 帧已经处理完
      // 回到了父帧（即当前 frame）。此刻需要把 child 的 low 反映到父：
      //   - rindex[child] > 0：child 仍在栈上 → low 可向上传播
      //   - rindex[child] < 0：child 已并入某个 SCC → 它不再代表"可达祖先"，不传播
      if (frame.pending !== NONE) {
        const child = frame.pending;
        frame.pending = NONE;
        const childLow = rindex[child]!;
        if (childLow > 0 && childLow < rindex[frame.node]!) {
          rindex[frame.node] = childLow;
        }
      }

      // ─── 3b：处理下一条出边 ─────────────────────────────────
      const step = frame.iterator.next();
      if (!step.done) {
        const target = index.get(step.value);
        if (target === undefined) continue;        // 孤儿邻居（不在 nodeIds 中）：见 internal/degree.ts
        const targetRank = rindex[target]!;
        if (targetRank === 0) {
          // 未访问：tree edge，下钻到子节点；pending 记录待回流。
          frame.pending = target;
          enter(target);
        } else if (targetRank > 0 && targetRank < rindex[frame.node]!) {
          // back / cross 到尚在栈上的节点：拉低当前帧的 low（指向更早的祖先）。
          // targetRank < 0 的情况（已完成 SCC）静默忽略：跨向其他 SCC，与本节点无关。
          rindex[frame.node] = targetRank;
        }
        continue;
      }

      // ─── 3c：当前帧出边枚举完 → 根判定 ─────────────────────
      // 关键定理：v 是 SCC 根 ⇔ rindex[v] 自始至终没被拉低（仍等于入栈时的 mark）。
      // 反证：若被拉低，说明 v 子树里有边能回到 v 的祖先 → v 不是 SCC 的最早节点。
      if (rindex[frame.node] === frame.mark) {
        const member: NodeId[] = [];
        let w: number;
        // 从候选栈顶弹出直到弹出 v 本身 —— 这一段就是以 v 为根的 SCC。
        do {
          w = stack.pop()!;
          // 编码为 -(component+1)：负数表示"已完成"，绝对值-1 是分量号。
          // 用 -(c+1) 而不是 -c 是为了让分量 0 也能与"未访问的 0"区分。
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
