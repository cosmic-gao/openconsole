import { PairingHeap, type PairingNode } from "@openconsole/heap";

import { Negative } from "../classic";
import type { Catalog, EdgeView, IntoEdges, NodeId } from "../types";

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
 * @throws Negative 当遇到负权边时抛出。
 */
export function dijkstra<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
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
