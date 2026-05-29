/**
 * bridges：无向图视角下的桥（割边）与割点（articulation points）。
 *
 * @remarks
 * 有向图按"忽略方向 + 保留 multi-edge"无向化：每条有向边 `(u, v)` 视为一条独立的无向边。
 * 这与图论中"删一条边后图是否多裂出一个分量"的实际语义一致 — 例如 `a→b` 与 `b→a`
 * 同时存在时，它们构成两条平行无向边，删一条还有另一条，因此不是桥。
 *
 * 实现：Tarjan 1973，迭代 DFS + typed-array；通过**父边 ID** 而非父节点跳过返回边，
 * 正确处理 multi-edge。
 */

import type { Catalog, EdgeId, EdgeView, IntoEdges, Neighbors, NodeId } from '../types';

/** 桥（无向语义）：删去后会增加连通分量数的边，用两端节点 ID 表示。 */
export interface Bridge {
  readonly from: NodeId;
  readonly to: NodeId;
}

/**
 * Tarjan 桥与割点检测。
 *
 * @remarks
 * 经典 Tarjan 1973 算法：对每个节点维护 `disc`（发现时间）和 `low`（自身或子树通过最多一条
 * 后向边能到达的最小 disc）。
 * - 边 `(u, v)`（v 是 u 的子树）是桥 ⇔ `low[v] > disc[u]`
 * - 节点 u 是割点 ⇔ DFS 树中存在子 v 使 `low[v] >= disc[u]`，或 u 是根且有 ≥ 2 个 DFS 子
 *
 * **multi-edge 安全**：用每条边的 `EdgeId` 而非父节点跳过返回边，因此平行边不会误判。
 *
 * @template E 边权重类型
 * @template G 满足 {@link Catalog} + {@link Neighbors} + {@link IntoEdges} 的图类型
 * @param graph 图实例
 * @returns `{ bridges, articulations }`
 *
 * @see Tarjan, R. (1974). "A note on finding the bridges of a graph." IPL 2(6).
 * @see Hopcroft, J.; Tarjan, R. (1973). "Algorithm 447: Efficient algorithms for graph manipulation."
 *   Comm. ACM 16(6).
 */
export function bridges<E, G extends Catalog & Neighbors & IntoEdges<E>>(graph: G): {
  bridges: Bridge[];
  articulations: NodeId[];
} {
  // ─── 节点编号：NodeId → 稠密整数 ─────────────────────────────
  const nodes: NodeId[] = [];
  const index = new Map<NodeId, number>();
  for (const id of graph.nodeIds) {
    if (!index.has(id)) {
      index.set(id, nodes.length);
      nodes.push(id);
    }
  }
  const n = nodes.length;

  // ─── 算法状态 ─────────────────────────────────────────────────
  // disc[v]：v 被发现的时间戳（-1 = 未访问）
  // low[v]：v 自身或其子树通过 *最多一条* 非父向边能到达的最小 disc
  //   - 初始 low[v] = disc[v]
  //   - 子返回时：low[v] = min(low[v], low[child])
  //   - 遇到非父向后/横边到已访问 w：low[v] = min(low[v], disc[w])
  // cut[v]：v 是否割点（Uint8 用作位标记，比 Set 紧凑）
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const cut = new Uint8Array(n);
  const bridgeList: Bridge[] = [];
  let timer = 0;

  type Frame = {
    readonly node: number;
    /**
     * 通过哪条 EdgeId 进入本节点；用于跳过这一条父边但不跳过 multi-edge 的兄弟。
     * 用 EdgeId（而非 parentNode）是 multi-edge 安全的关键：
     * 若 a-b 之间有两条平行边 e1/e2，DFS 通过 e1 到 b，从 b 看到 e2 仍要算 back edge，
     * 否则会把这条平行边漏掉、把 a-b 误判为桥。
     */
    readonly viaEdge: EdgeId | null;
    readonly iterator: Iterator<EdgeView<E>>;
    /** DFS 树中的子数，根节点判割点时用 */
    children: number;
    /** 同 scc.ts 的 pending 技巧：上一轮 enter 的子，需回流 low */
    pending: number;
  };
  const NONE = -1;
  const frames: Frame[] = [];

  // 无向边视图：合并入边 + 出边，自环（source === target）只算一次。
  // 注意 getOutgoing 已经覆盖自环，所以入边里的自环要跳过避免重复。
  const incident = function* (v: NodeId): Iterable<EdgeView<E>> {
    yield* graph.getOutgoing(v);
    for (const e of graph.getIncoming(v)) {
      if (e.source === v) continue;
      yield e;
    }
  };

  // 给定一条边和本端节点，返回边的另一端。
  const otherEnd = (e: EdgeView<E>, here: NodeId): NodeId =>
    e.source === here ? e.target : e.source;

  // 把节点压入 DFS 栈：分配 disc/low、构造帧。
  const enter = (v: number, viaEdge: EdgeId | null): void => {
    disc[v] = low[v] = timer++;
    frames.push({
      node: v,
      viaEdge,
      iterator: incident(nodes[v]!)[Symbol.iterator](),
      children: 0,
      pending: NONE,
    });
  };

  // ─── 主循环：对每个未访问的根做迭代 DFS ─────────────────────
  for (let root = 0; root < n; root++) {
    if (disc[root] !== -1) continue;
    enter(root, null);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;

      // ─── 步骤 A：子帧刚返回 → 回流 + 桥判定 + 割点判定 ─────
      if (frame.pending !== NONE) {
        const child = frame.pending;
        frame.pending = NONE;

        // A1：回流 low（子树能到的最早祖先也是当前节点能到的）
        if (low[child]! < low[frame.node]!) low[frame.node] = low[child]!;

        // A2：桥判定 —— low[child] > disc[node] 表示 child 子树绕不回 node 之前的任何节点
        //                ⇒ 删 node-child 这条边后图就裂开
        if (low[child]! > disc[frame.node]!) {
          bridgeList.push({ from: nodes[frame.node]!, to: nodes[child]! });
        }

        // A3：非根的割点判定 —— low[child] >= disc[node] 表示 child 子树最远到 node 自己
        //                       ⇒ 删 node 后 child 子树与 node 之前的部分断开
        //                       根节点的割点判定走不同规则（见步骤 C）
        if (frame.viaEdge !== null && low[child]! >= disc[frame.node]!) {
          cut[frame.node] = 1;
        }
      }

      // ─── 步骤 B：处理下一条邻接边 ───────────────────────────
      const step = frame.iterator.next();
      if (!step.done) {
        const edge = step.value;
        // 跳过父边（无向语义：父-子边在 DFS 树中走过一次就算了）
        if (frame.viaEdge !== null && edge.id === frame.viaEdge) continue;
        const w = index.get(otherEnd(edge, nodes[frame.node]!));
        if (w === undefined || w === frame.node) continue;     // 孤儿或自环
        if (disc[w] === -1) {
          // tree edge：下钻
          frame.children++;
          frame.pending = w;
          enter(w, edge.id);
        } else if (disc[w]! < low[frame.node]!) {
          // back / cross edge：拉低 low（指向更早的祖先）
          low[frame.node] = disc[w]!;
        }
        continue;
      }

      // ─── 步骤 C：根节点的割点判定 ───────────────────────────
      // 根没有"非父向边"概念，规则不同：根节点是割点 ⇔ DFS 树有 ≥ 2 个子。
      // 直觉：根有 2 个子 ⇒ 它们没有别的路径连通 ⇒ 删根后图必裂。
      if (frame.viaEdge === null && frame.children >= 2) cut[frame.node] = 1;
      frames.pop();
    }
  }

  // ─── 收集割点结果 ──────────────────────────────────────────
  const articulations: NodeId[] = [];
  for (let i = 0; i < n; i++) if (cut[i] === 1) articulations.push(nodes[i]!);

  return { bridges: bridgeList, articulations };
}
