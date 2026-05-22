/**
 * bidijkstra：双向 Dijkstra 单源单汇最短路径。
 */

import { PairingHeap, type PairingNode } from '@openconsole/heap';

import { Negative } from '../classic';
import type { Catalog, EdgeId, EdgeView, IntoEdges, NodeId } from '../types';

/** 堆中的待处理项：节点 + 距搜索端点的距离。 */
interface Entry {
  readonly node: NodeId;
  readonly dist: number;
}

/**
 * 一端（前向或后向）搜索的全部局部状态。
 *
 * @remarks `link[v]` 在前向是 v 的前驱、在后向是 v 的后继；都表示"v 沿当前最短路径
 * 远离搜索原点的下一跳"，因此命名统一。
 */
interface Side {
  dist: Map<NodeId, number>;
  link: Map<NodeId, NodeId>;
  settled: Set<NodeId>;
  handles: Map<NodeId, PairingNode<Entry>>;
  heap: PairingHeap<Entry>;
}

const open = (origin: NodeId): Side => {
  const heap = new PairingHeap<Entry>((a, b) => a.dist - b.dist);
  const handles = new Map<NodeId, PairingNode<Entry>>();
  handles.set(origin, heap.push({ node: origin, dist: 0 }));
  return {
    dist: new Map([[origin, 0]]),
    link: new Map(),
    settled: new Set(),
    handles,
    heap,
  };
};

const guard = (cost: number, edgeId: EdgeId): void => {
  if (cost < 0) throw new Negative(cost, edgeId);
};

/**
 * 双向 Dijkstra：从 `start` 与 `end` 同时搜索，前向在原图、后向在反向图，在中间相遇。
 *
 * @remarks
 * 提前终止：每次循环开头比较两堆栈顶 `topF + topB >= μ`——未探索区域至少要付这些代价
 * 才能跨越，劣于当前已知 μ 时无需继续。平衡式扩展：弹哪边 top 更小走哪边，让两半工作量持平。
 *
 * @template E 边权重类型
 * @template G 满足 {@link Catalog} + {@link IntoEdges} 的图类型
 * @param graph 图实例
 * @param start 起点
 * @param end 终点
 * @param edgeCost 边代价函数，必须返回非负数
 * @returns `{ distance, path }`；`start` 无法到达 `end` 时返回 `undefined`
 * @throws {Error} `edgeCost` 返回负数时
 *
 * @see arXiv 2410.14638 (2024) — Bidirectional Dijkstra's Algorithm is Instance-Optimal
 */
export function bidijkstra<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
  start: NodeId,
  end: NodeId,
  edgeCost: (edge: EdgeView<E>) => number,
): { distance: number; path: NodeId[] } | undefined {
  if (start === end) return { distance: 0, path: [start] };

  // ─── 双侧搜索状态 ──────────────────────────────────────────
  // fwd：从 start 出发的正向 Dijkstra
  // bwd：从 end   出发的反向 Dijkstra（沿入边走 = 在反向图上正向走）
  const fwd = open(start);
  const bwd = open(end);

  // mu = 当前已知的"通过相遇点"的最短总距离；初始 ∞
  // meet = 最佳相遇节点；用于路径回溯
  let mu = Infinity;
  let meet: NodeId | undefined;

  // relax：一侧的"松弛 + 检查是否产生更短的相遇路径"
  // near = 本侧状态；far = 另一侧状态
  // 若 target 已在另一侧的距离表中，组合 (near.dist[origin]+cost) + far.dist[target] 看是否更短
  const relax = (origin: NodeId, target: NodeId, cost: number, near: Side, far: Side): void => {
    if (near.settled.has(target)) return;
    const candidate = near.dist.get(origin)! + cost;
    const cur = near.dist.get(target);
    if (cur !== undefined && candidate >= cur) return;
    near.dist.set(target, candidate);
    near.link.set(target, origin);
    const handle = near.handles.get(target);
    if (handle !== undefined) {
      near.heap.update(handle, { node: target, dist: candidate });
    } else {
      near.handles.set(target, near.heap.push({ node: target, dist: candidate }));
    }
    // 跨侧相遇检测：若 target 已被另一侧"探到"，组合两侧距离看能否刷新 mu
    const farDist = far.dist.get(target);
    if (farDist !== undefined) {
      const total = candidate + farDist;
      if (total < mu) {
        mu = total;
        meet = target;
      }
    }
  };

  // ─── 主循环：交替扩展、提前终止 ─────────────────────────────
  while (!fwd.heap.empty() && !bwd.heap.empty()) {
    // 提前终止：未探索区域至少要 topF + topB 的代价才能跨越；
    // 一旦这个下界 ≥ 当前已知 mu，再继续不可能改进 mu。
    if (fwd.heap.peek()!.dist + bwd.heap.peek()!.dist >= mu) break;

    // 平衡扩展：弹哪边 top 更小走哪边，让两侧已探索范围对称生长
    if (fwd.heap.peek()!.dist <= bwd.heap.peek()!.dist) {
      // 正向走一步：弹 fwd 最小、settle、用其出边 relax
      const entry = fwd.heap.poll()!;
      const node = entry.node;
      fwd.handles.delete(node);
      fwd.settled.add(node);
      // 弹出时也检查是否相遇（可能 relax 时还没相遇，settle 时另一侧已经探到了）
      const farDist = bwd.dist.get(node);
      if (farDist !== undefined) {
        const total = entry.dist + farDist;
        if (total < mu) {
          mu = total;
          meet = node;
        }
      }
      for (const edge of graph.getOutgoing(node)) {
        const cost = edgeCost(edge);
        guard(cost, edge.id);
        relax(node, edge.target, cost, fwd, bwd);
      }
    } else {
      // 反向走一步：弹 bwd 最小、用其入边 relax（"反向图上的出边"）
      const entry = bwd.heap.poll()!;
      const node = entry.node;
      bwd.handles.delete(node);
      bwd.settled.add(node);
      const farDist = fwd.dist.get(node);
      if (farDist !== undefined) {
        const total = farDist + entry.dist;
        if (total < mu) {
          mu = total;
          meet = node;
        }
      }
      for (const edge of graph.getIncoming(node)) {
        const cost = edgeCost(edge);
        guard(cost, edge.id);
        relax(node, edge.source, cost, bwd, fwd);
      }
    }
  }

  if (mu === Infinity || meet === undefined) return undefined;

  // ─── 路径重建 ──────────────────────────────────────────────
  // fwd.link[v] = v 在正向最短路径上的前驱
  // bwd.link[v] = v 在反向最短路径上的"前驱"（实际是正向意义上的后继）
  // 1. 从 meet 沿 fwd.link 一路反走到 start，unshift 得到 start..meet 段
  // 2. 从 bwd.link[meet] 开始沿 bwd.link 走到 end，push 得到 meet+1..end 段
  const path: NodeId[] = [];
  let cur: NodeId | undefined = meet;
  while (cur !== undefined) {
    path.unshift(cur);
    if (cur === start) break;
    cur = fwd.link.get(cur);
  }
  cur = bwd.link.get(meet);
  while (cur !== undefined) {
    path.push(cur);
    if (cur === end) break;
    cur = bwd.link.get(cur);
  }

  return { distance: mu, path };
}
