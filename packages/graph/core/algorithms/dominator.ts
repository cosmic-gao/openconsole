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
  // dfs 序 ↔ NodeId 双向映射 + DFS 树父 + 每节点前驱（按 dfs 序，第二遍填）。
  const dfn: NodeId[] = [];
  const num = new Map<NodeId, number>();
  const parent: number[] = [];
  const preds: number[][] = [];

  type Frame = { v: NodeId; iter: Iterator<NodeId> };
  const stack: Frame[] = [{ v: entry, iter: graph.downstream(entry)[Symbol.iterator]() }];
  num.set(entry, 0);
  dfn.push(entry);
  parent.push(-1);
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
      const childIdx = dfn.length;
      const parentIdx = num.get(frame.v)!;
      num.set(child, childIdx);
      dfn.push(child);
      parent.push(parentIdx);
      preds.push([]);
      stack.push({ v: child, iter: graph.downstream(child)[Symbol.iterator]() });
    }
  }

  const n = dfn.length;

  // 前驱必须等 num 完整后才能 dfs-编码，所以走第二遍。
  for (let i = 0; i < n; i++) {
    for (const up of graph.upstream(dfn[i]!)) {
      const ui = num.get(up);
      if (ui !== undefined) preds[i]!.push(ui);
    }
  }

  // Lengauer-Tarjan 主算法。
  // semi[v]：半支配者的 dfs 序，初始 = 自己。
  // ancestor[v]：v 在 link/eval 森林中的祖先。
  // label[v]：森林根到 v 路径上 semi 最小的节点。
  // bucket[w]：semi 等于 w 的节点集合，待 parent[w] 处理时一并消化。
  // dom[v]：最终的 idom 序号；过程中先存半支配候选。
  const semi = new Int32Array(n);
  const ancestor = new Int32Array(n).fill(-1);
  const label = new Int32Array(n);
  const bucket: number[][] = Array.from({ length: n }, () => []);
  const dom = new Int32Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    semi[i] = i;
    label[i] = i;
  }

  // 迭代路径压缩：先走到根、再回头更新 label / ancestor，避免递归栈溢出。
  const compress = (v: number): void => {
    const path: number[] = [];
    let cur = v;
    while (ancestor[ancestor[cur]!]! !== -1) {
      path.push(cur);
      cur = ancestor[cur]!;
    }
    for (let i = path.length - 1; i >= 0; i--) {
      const w = path[i]!;
      const a = ancestor[w]!;
      if (semi[label[a]!]! < semi[label[w]!]!) {
        label[w] = label[a]!;
      }
      ancestor[w] = ancestor[a]!;
    }
  };

  const evalNode = (v: number): number => {
    if (ancestor[v] === -1) return v;
    compress(v);
    return label[v]!;
  };

  // 倒序处理 dfs[1..n-1]：求 semi、link 入森林、处理父的 bucket。
  for (let w = n - 1; w > 0; w--) {
    for (const u of preds[w]!) {
      const ev = evalNode(u);
      if (semi[ev]! < semi[w]!) semi[w] = semi[ev]!;
    }
    bucket[semi[w]!]!.push(w);
    ancestor[w] = parent[w]!;

    const p = parent[w]!;
    const queue = bucket[p]!;
    for (const v of queue) {
      const u = evalNode(v);
      dom[v] = semi[u]! < semi[v]! ? u : p;
    }
    queue.length = 0;
  }

  // 正序回填：半支配候选不等于 semi[w] 时，沿候选链跳一步得到真 idom。
  for (let w = 1; w < n; w++) {
    if (dom[w] !== semi[w]) dom[w] = dom[dom[w]!]!;
  }

  const result = new Map<NodeId, NodeId>();
  result.set(entry, entry);
  for (let w = 1; w < n; w++) {
    result.set(dfn[w]!, dfn[dom[w]!]!);
  }
  return result;
}
