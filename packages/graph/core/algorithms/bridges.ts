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
  // 节点编号
  const nodes: NodeId[] = [];
  const index = new Map<NodeId, number>();
  for (const id of graph.nodeIds) {
    if (!index.has(id)) {
      index.set(id, nodes.length);
      nodes.push(id);
    }
  }
  const n = nodes.length;

  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const cut = new Uint8Array(n);
  const bridgeList: Bridge[] = [];
  let timer = 0;

  type Frame = {
    readonly node: number;
    /** 通过哪条 EdgeId 进入本节点；用于跳过这一条父边但不跳过 multi-edge 的兄弟。 */
    readonly viaEdge: EdgeId | null;
    readonly iter: Iterator<EdgeView<E>>;
    children: number;
    pending: number;
  };
  const NONE = -1;
  const frames: Frame[] = [];

  // 无向边视图：合并入边 + 出边，自环只算一次。
  const incident = function* (v: NodeId): Iterable<EdgeView<E>> {
    yield* graph.getOutgoing(v);
    for (const e of graph.getIncoming(v)) {
      if (e.source === v) continue;
      yield e;
    }
  };

  const otherEnd = (e: EdgeView<E>, here: NodeId): NodeId =>
    e.source === here ? e.target : e.source;

  const enter = (v: number, viaEdge: EdgeId | null): void => {
    disc[v] = low[v] = timer++;
    frames.push({
      node: v,
      viaEdge,
      iter: incident(nodes[v]!)[Symbol.iterator](),
      children: 0,
      pending: NONE,
    });
  };

  for (let root = 0; root < n; root++) {
    if (disc[root] !== -1) continue;
    enter(root, null);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;

      if (frame.pending !== NONE) {
        const child = frame.pending;
        frame.pending = NONE;
        if (low[child]! < low[frame.node]!) low[frame.node] = low[child]!;
        if (low[child]! > disc[frame.node]!) {
          bridgeList.push({ from: nodes[frame.node]!, to: nodes[child]! });
        }
        if (frame.viaEdge !== null && low[child]! >= disc[frame.node]!) {
          cut[frame.node] = 1;
        }
      }

      const step = frame.iter.next();
      if (!step.done) {
        const edge = step.value;
        if (frame.viaEdge !== null && edge.id === frame.viaEdge) continue;
        const w = index.get(otherEnd(edge, nodes[frame.node]!));
        if (w === undefined || w === frame.node) continue;
        if (disc[w] === -1) {
          frame.children++;
          frame.pending = w;
          enter(w, edge.id);
        } else if (disc[w]! < low[frame.node]!) {
          low[frame.node] = disc[w]!;
        }
        continue;
      }

      // 根节点割点：DFS 树中有 ≥ 2 个子
      if (frame.viaEdge === null && frame.children >= 2) cut[frame.node] = 1;
      frames.pop();
    }
  }

  const articulations: NodeId[] = [];
  for (let i = 0; i < n; i++) if (cut[i] === 1) articulations.push(nodes[i]!);

  return { bridges: bridgeList, articulations };
}
