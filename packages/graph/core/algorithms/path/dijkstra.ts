import { PairingHeap, type PairingNode } from "@openconsole/heap";
import { LazyQueue } from "@openconsole/queue";

import { Negative } from "../../model";
import { hasIndex } from "../../support";
import type {
  Catalog,
  EdgeView,
  IntoEdges,
  NodeId,
  NodeIndexable,
} from "../../types";

/** 最短路径树中单个节点的条目：到起点的累计距离及其前驱（用于 {@link path} 重建路径）。 */
export interface Path {
  distance: number;
  predecessor: NodeId | undefined;
}

interface Reach {
  readonly node: NodeId;
  readonly dist: number;
}

/**
 * 非负权单源最短路（Dijkstra），返回从 start 出发的最短路径树。
 * 配 {@link path} 可重建到任意目标的路径。复杂度约 O((V+E) log V)。
 * 传 end 时摸到即提前返回，未 settle 的节点不会出现在结果中。
 *
 * 当图实现 {@link NodeIndexable}（如 {@link Graph} / {@link Csr}）时，自动走稠密整数下标 +
 * typed-array 记账快路，避免 `Map<NodeId>` / `Set<NodeId>` 的字符串哈希开销；否则回退到通用实现。
 * 两条路径返回结果完全一致。
 * @throws Negative 当遇到负权边时抛出。
 */
export function dijkstra<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
  start: NodeId,
  end: NodeId | undefined,
  edgeCost: (edge: EdgeView<E>) => number,
): Map<NodeId, Path> {
  if (hasIndex(graph)) return dense(graph, start, end, edgeCost);
  return sparse(graph, start, end, edgeCost);
}

/**
 * 稠密整数下标快路：距离 / 前驱 / 访问标记全部按 {@link NodeIndexable.indexOf}
 * 下标存入 typed-array，优先队列走 {@link LazyQueue}——改善即入队，靠 `settled`
 * 位图跳过过期条目，因此不需要 decrease-key 也不需要句柄簿记。
 */
function dense<E>(
  graph: Catalog & IntoEdges<E> & NodeIndexable,
  start: NodeId,
  end: NodeId | undefined,
  edgeCost: (edge: EdgeView<E>) => number,
): Map<NodeId, Path> {
  const result = new Map<NodeId, Path>();
  const s = graph.indexOf(start);
  if (s < 0) {
    result.set(start, { distance: 0, predecessor: undefined });
    return result;
  }

  const n = graph.bound();
  const dist = new Float64Array(n);
  const prev = new Int32Array(n).fill(-1);
  const settled = new Uint8Array(n);
  const reached = new Uint8Array(n);
  const queue = new LazyQueue(n);

  dist[s] = 0;
  reached[s] = 1;
  queue.push(s, 0);

  for (let u = queue.poll(); u !== -1; u = queue.poll()) {
    // 下标首次出队时携带的必是其最小距离，其余条目一律过期。
    if (settled[u] === 1) continue;
    settled[u] = 1;

    const uid = graph.at(u)!;
    if (uid === end) break;

    const base = dist[u]!;
    for (const edge of graph.outEdges(uid)) {
      const v = graph.indexOf(edge.target);
      if (v < 0 || settled[v] === 1) continue;
      const cost = edgeCost(edge);
      if (cost < 0) throw new Negative(cost, edge.id);
      const candidate = base + cost;

      if (reached[v] === 0 || candidate < dist[v]!) {
        reached[v] = 1;
        dist[v] = candidate;
        prev[v] = u;
        queue.push(v, candidate);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (reached[i] === 0) continue;
    const p = prev[i]!;
    result.set(graph.at(i)!, {
      distance: dist[i]!,
      predecessor: p === -1 ? undefined : graph.at(p)!,
    });
  }
  return result;
}

/** 通用实现：图不提供整数下标时按 NodeId 走 `Map` / `Set` 记账。 */
function sparse<E>(
  graph: Catalog & IntoEdges<E>,
  start: NodeId,
  end: NodeId | undefined,
  edgeCost: (edge: EdgeView<E>) => number,
): Map<NodeId, Path> {
  const result = new Map<NodeId, Path>();
  const handles = new Map<NodeId, PairingNode<Reach>>();
  const visited = new Set<NodeId>();
  const heap = new PairingHeap<Reach>((a, b) => a.dist - b.dist);

  result.set(start, { distance: 0, predecessor: undefined });
  handles.set(start, heap.push({ node: start, dist: 0 }));

  while (!heap.empty()) {
    const reach = heap.poll()!;
    const node = reach.node;
    handles.delete(node);
    visited.add(node);

    if (node === end) break;

    for (const edge of graph.outEdges(node)) {
      if (visited.has(edge.target)) continue;
      const cost = edgeCost(edge);
      if (cost < 0) throw new Negative(cost, edge.id);
      const candidate = reach.dist + cost;

      const handle = handles.get(edge.target);
      if (handle !== undefined) {
        if (candidate < handle.value.dist) {
          heap.update(handle, { node: edge.target, dist: candidate });
          result.set(edge.target, { distance: candidate, predecessor: node });
        }
      } else {
        result.set(edge.target, { distance: candidate, predecessor: node });
        handles.set(
          edge.target,
          heap.push({ node: edge.target, dist: candidate }),
        );
      }
    }
  }

  return result;
}

/** 沿最短路径树的前驱链重建 start 到 target 的节点序列；target 不在树中则返回空数组。 */
export function path(
  tree: ReadonlyMap<NodeId, Path>,
  target: NodeId,
): NodeId[] {
  if (!tree.has(target)) return [];
  const result: NodeId[] = [];
  let cursor: NodeId | undefined = target;
  while (cursor !== undefined) {
    result.push(cursor);
    cursor = tree.get(cursor)?.predecessor;
  }
  return result.reverse();
}
