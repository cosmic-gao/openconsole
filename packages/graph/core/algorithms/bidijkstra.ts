/**
 * bidijkstra：双向 Dijkstra 单源单汇最短路径。
 */

import { PairingHeap, type PairingNode } from '@opendesign/heap';

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
  if (cost < 0) {
    throw new Error(
      `bidijkstra: negative edge cost ${cost} on edge "${String(edgeId)}"; use Bellman-Ford for negative weights.`,
    );
  }
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

  const fwd = open(start);
  const bwd = open(end);

  let mu = Infinity;
  let meet: NodeId | undefined;

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
    const farDist = far.dist.get(target);
    if (farDist !== undefined) {
      const total = candidate + farDist;
      if (total < mu) {
        mu = total;
        meet = target;
      }
    }
  };

  while (!fwd.heap.empty() && !bwd.heap.empty()) {
    if (fwd.heap.peek()!.dist + bwd.heap.peek()!.dist >= mu) break;

    if (fwd.heap.peek()!.dist <= bwd.heap.peek()!.dist) {
      const entry = fwd.heap.poll()!;
      const node = entry.node;
      fwd.handles.delete(node);
      fwd.settled.add(node);
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

  // 路径重建：fwd.link 链 meet → start，逆序拼接；bwd.link 链 meet → end，正序追加。
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
