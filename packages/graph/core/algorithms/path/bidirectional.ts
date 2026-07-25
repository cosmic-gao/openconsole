import { PairingHeap, type PairingNode } from "@openconsole/heap";

import { Negative } from "../../model";
import type { Catalog, EdgeId, EdgeView, IntoEdges, NodeId } from "../../types";

interface Entry {
  readonly node: NodeId;
  readonly dist: number;
}

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
 * 双向 Dijkstra：从 start 正向、end 反向同时搜索，相遇时停止，求单条最短路。
 * 仅支持非负权；通常比单向 Dijkstra 探索更少节点。
 * @returns 最短距离与路径节点序列；不可达时返回 undefined。
 * @throws Negative 当遇到负权边时抛出。
 */
export function bidijkstra<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
  start: NodeId,
  end: NodeId,
  edgeCost: (edge: EdgeView<E>) => number,
): { distance: number; path: NodeId[] } | undefined {
  if (start === end) return { distance: 0, path: [start] };

  const forward = open(start);
  const backward = open(end);

  let mu = Infinity;
  let meet: NodeId | undefined;

  const relax = (
    origin: NodeId,
    target: NodeId,
    cost: number,
    near: Side,
    far: Side,
  ): void => {
    if (near.settled.has(target)) return;
    const candidate = near.dist.get(origin)! + cost;
    const current = near.dist.get(target);
    if (current !== undefined && candidate >= current) return;
    near.dist.set(target, candidate);
    near.link.set(target, origin);
    const handle = near.handles.get(target);
    if (handle !== undefined) {
      near.heap.update(handle, { node: target, dist: candidate });
    } else {
      near.handles.set(
        target,
        near.heap.push({ node: target, dist: candidate }),
      );
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

  while (!forward.heap.empty() && !backward.heap.empty()) {
    if (forward.heap.peek()!.dist + backward.heap.peek()!.dist >= mu) break;

    if (forward.heap.peek()!.dist <= backward.heap.peek()!.dist) {
      const entry = forward.heap.poll()!;
      const node = entry.node;
      forward.handles.delete(node);
      forward.settled.add(node);
      const farDist = backward.dist.get(node);
      if (farDist !== undefined) {
        const total = entry.dist + farDist;
        if (total < mu) {
          mu = total;
          meet = node;
        }
      }
      for (const edge of graph.outEdges(node)) {
        const cost = edgeCost(edge);
        guard(cost, edge.id);
        relax(node, edge.target, cost, forward, backward);
      }
    } else {
      const entry = backward.heap.poll()!;
      const node = entry.node;
      backward.handles.delete(node);
      backward.settled.add(node);
      const farDist = forward.dist.get(node);
      if (farDist !== undefined) {
        const total = farDist + entry.dist;
        if (total < mu) {
          mu = total;
          meet = node;
        }
      }
      for (const edge of graph.inEdges(node)) {
        const cost = edgeCost(edge);
        guard(cost, edge.id);
        relax(node, edge.source, cost, backward, forward);
      }
    }
  }

  if (mu === Infinity || meet === undefined) return undefined;

  const path: NodeId[] = [];
  let current: NodeId | undefined = meet;
  while (current !== undefined) {
    path.unshift(current);
    if (current === start) break;
    current = forward.link.get(current);
  }
  current = backward.link.get(meet);
  while (current !== undefined) {
    path.push(current);
    if (current === end) break;
    current = backward.link.get(current);
  }

  return { distance: mu, path };
}
