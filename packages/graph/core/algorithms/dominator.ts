/**
 * dominator：Lengauer-Tarjan 支配树算法。
 *
 * @remarks
 * 用途：编译器（SSA 构造、循环识别、可达性优化）、依赖分析（"删谁能解开 X"）、
 * 控制流图（"哪些块必经"）。复杂度 O(E · α(V, E))，α 是反 Ackermann，实际近线性。
 */

import type { Catalog, Neighbors, NodeId } from '../types';

/**
 * 计算以 `entry` 为根的支配树，返回 `idom: NodeId → 直接支配者`。
 *
 * @remarks
 * 支配关系定义：对入口 `entry` 可达的节点 `v`，节点 `u` **支配** `v` ⇔ 从 `entry` 到 `v` 的
 * 任意路径都经过 `u`。`v` 的**直接支配者**（immediate dominator）`idom(v)` 是 `v` 的所有严格
 * 支配者中最接近 `v` 的那个。
 *
 * 不可达节点不会出现在结果中。`entry` 自身映射到自己（约定）。
 *
 * @template G 满足 {@link Catalog} + {@link Neighbors} 的图类型
 * @param graph 图实例
 * @param entry 入口节点
 * @returns `idom` 映射；不可达节点不在表中
 *
 * @see Lengauer, T.; Tarjan, R. (1979). "A fast algorithm for finding dominators in a flowgraph."
 *   ACM TOPLAS 1(1).
 */
export function dominator<G extends Catalog & Neighbors>(
  graph: G,
  entry: NodeId,
): Map<NodeId, NodeId> {
  // ═══════════════════════════════════════════════════════════════════
  //  Lengauer-Tarjan 总览（教学注释）
  // ═══════════════════════════════════════════════════════════════════
  // 算法分四阶段：
  //   阶段 1：DFS 编号（dfn[i] = 第 i 个被访问的节点）
  //   阶段 2：第二遍扫描收集前驱（preds[i] = 节点 i 的 dfs 序前驱列表）
  //   阶段 3：主循环 —— 倒序求每个节点的 semi-dominator（半支配者）+ 部分 idom
  //   阶段 4：正序回填 —— 把 idom 候选修正为真 idom
  //
  // 关键概念：
  //   - semi(w)：从某节点 u 出发，经过 dfs 序 > w 的中间节点，能到 w 的最早 u（最小 dfn）
  //   - idom(w)：w 的直接支配者；定理：idom(w) 必是 semi(w) 或其某个祖先
  //   - link/eval 森林：用并查集 + 路径压缩支持高效"询问某节点祖先链上 semi 最小的节点"
  // ═══════════════════════════════════════════════════════════════════

  // ─── 阶段 1：迭代 DFS 编号 ────────────────────────────────────────
  // dfn[i] → NodeId：dfs 第 i 个访问的节点
  // num.get(id) → 该节点的 dfs 序号
  // parent[i] → 节点 i 的 DFS 树父节点 dfs 序
  // preds[i] → 节点 i 的所有前驱（按 dfs 序），第二遍填
  const dfn: NodeId[] = [];
  const num = new Map<NodeId, number>();
  const parent: number[] = [];
  const preds: number[][] = [];

  // 迭代 DFS：把递归改成显式栈，避免深图栈溢出。
  type Frame = { v: NodeId; iter: Iterator<NodeId> };
  const stack: Frame[] = [{ v: entry, iter: graph.downstream(entry)[Symbol.iterator]() }];
  num.set(entry, 0);
  dfn.push(entry);
  parent.push(-1);              // entry 没有父
  preds.push([]);

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    const step = frame.iter.next();
    if (step.done) {
      stack.pop();
      continue;
    }
    const child = step.value;
    if (!num.has(child)) {
      // tree edge：分配新 dfs 序、记录父子关系、下钻
      const childIdx = dfn.length;
      const parentIdx = num.get(frame.v)!;
      num.set(child, childIdx);
      dfn.push(child);
      parent.push(parentIdx);
      preds.push([]);
      stack.push({ v: child, iter: graph.downstream(child)[Symbol.iterator]() });
    }
    // child 已编号：跳过（非 tree edge 在此算法中不需要特殊处理）
  }

  const n = dfn.length;

  // ─── 阶段 2：收集前驱（第二遍）──────────────────────────────────
  // 为什么要第二遍？因为 dfs 编号一边走一边定，下钻时还不知道未访问节点的最终编号；
  // 全部访问完后再走一遍，每个前驱的 dfs 序才是完整的。
  // 不可达节点不在 num 中（不会被追加到 preds），所以这里只看可达图。
  for (let i = 0; i < n; i++) {
    for (const up of graph.upstream(dfn[i]!)) {
      const ui = num.get(up);
      if (ui !== undefined) preds[i]!.push(ui);
    }
  }

  // ─── 阶段 3：Lengauer-Tarjan 主算法 ─────────────────────────────
  // 状态字段：
  //   semi[v]      = 半支配者 dfs 序，初始 = 自己（=v）；越走越小
  //   ancestor[v]  = link/eval 森林中 v 的父；-1 = 尚未 link
  //   label[v]     = 从 v 沿 ancestor 走到森林根，路径上 semi 最小的节点
  //   bucket[w]    = 等待 w 被 link 后处理 idom 的节点集合（key = semi(它们)）
  //   dom[v]       = idom 候选；阶段 4 修正后即真 idom
  const semi = new Int32Array(n);
  const ancestor = new Int32Array(n).fill(-1);
  const label = new Int32Array(n);
  const bucket: number[][] = Array.from({ length: n }, () => []);
  const dom = new Int32Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    semi[i] = i;
    label[i] = i;
  }

  // 路径压缩（带 semi 比较）：把 v 到森林根的链上所有节点直挂根，
  // 顺便维护"链上 semi 最小者"到 label。
  // 写成迭代避免递归栈溢出 —— 先走到根，再回头一路更新。
  const compress = (v: number): void => {
    const path: number[] = [];
    let cur = v;
    // 走到根的前一站（ancestor[ancestor[cur]] === -1 时停）
    while (ancestor[ancestor[cur]!]! !== -1) {
      path.push(cur);
      cur = ancestor[cur]!;
    }
    // 回头扫，按 link/eval 经典公式更新 label：
    //   若 semi(label[ancestor[w]]) < semi(label[w]) 则 label[w] = label[ancestor[w]]
    for (let i = path.length - 1; i >= 0; i--) {
      const w = path[i]!;
      const a = ancestor[w]!;
      if (semi[label[a]!]! < semi[label[w]!]!) {
        label[w] = label[a]!;
      }
      ancestor[w] = ancestor[a]!;
    }
  };

  // eval(v)：返回从 v 到森林根的链上 semi 最小的节点。
  // 若 v 还没 link（ancestor=-1），它就是自己（label[v] = v）。
  const evalNode = (v: number): number => {
    if (ancestor[v] === -1) return v;
    compress(v);
    return label[v]!;
  };

  // 倒序处理 dfs[1..n-1]（dfs[0] 是 entry，不计算其支配者）。
  // 三件事：求 semi[w]、把 w 入桶、把 parent[w] 的桶里的节点求 idom 候选。
  for (let w = n - 1; w > 0; w--) {
    // 3a：用每个前驱 u 的 label 更新 semi[w]
    //     Lengauer-Tarjan 定理：semi(w) = min over u ∈ pred(w) of {
    //       u 本身（若 dfn(u) < dfn(w)） 或 semi 链上某祖先的 dfn
    //     }
    //     evalNode(u) 一次拿到"链上 semi 最小者"，再读它的 semi 即可。
    for (const u of preds[w]!) {
      const ev = evalNode(u);
      if (semi[ev]! < semi[w]!) semi[w] = semi[ev]!;
    }
    // 3b：把 w 暂存到"semi(w) 对应节点"的桶；等那个节点被 link 时统一处理。
    bucket[semi[w]!]!.push(w);
    // 3c：link(parent[w], w) —— 把 w 挂到森林中父下面
    ancestor[w] = parent[w]!;

    // 3d：处理 parent[w] 的桶。桶里每个 v 满足 semi(v) === parent[w]，
    //     对这些 v 求 idom 候选：让 u = eval(v)；若 semi(u) < semi(v) 则 dom(v)=u，否则 dom(v)=parent[w]
    const p = parent[w]!;
    const queue = bucket[p]!;
    for (const v of queue) {
      const u = evalNode(v);
      dom[v] = semi[u]! < semi[v]! ? u : p;
    }
    queue.length = 0;
  }

  // ─── 阶段 4：正序回填真 idom ─────────────────────────────────
  // 定理：若 dom[w] !== semi[w]，则真 idom = dom[dom[w]]
  // 正序保证 dom[dom[w]] 已经修正完毕。
  for (let w = 1; w < n; w++) {
    if (dom[w] !== semi[w]) dom[w] = dom[dom[w]!]!;
  }

  // ─── 输出：dfs 序 → NodeId，外部以 Map 形式消费 ──────────────
  // 约定 entry → entry（自身作为根标记，方便调用方判断"是不是根"）
  const result = new Map<NodeId, NodeId>();
  result.set(entry, entry);
  for (let w = 1; w < n; w++) {
    result.set(dfn[w]!, dfn[dom[w]!]!);
  }
  return result;
}
