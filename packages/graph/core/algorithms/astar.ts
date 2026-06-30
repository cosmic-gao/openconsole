import { PairingHeap, type PairingNode } from "@openconsole/heap";

import { Negative } from "../classic";
import type { Catalog, EdgeView, IntoEdges, NodeId } from "../types";

interface Entry {
  readonly node: NodeId;
  readonly g: number;
  readonly f: number;
}

/**
 * A* 启发式最短路：以 g+h 为优先级搜索 start 到 end。
 * heuristic 需可采纳（不高估真实剩余代价）才能保证最优；默认零启发退化为 Dijkstra。
 * 仅支持非负权。
 * @returns 最短距离与路径节点序列；不可达时返回 undefined。
 * @throws Negative 当遇到负权边时抛出。
 */
export function astar<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
  start: NodeId,
  end: NodeId,
  cost: (edge: EdgeView<E>) => number,
  heuristic: (node: NodeId) => number = zero,
): { distance: number; path: NodeId[] } | undefined {
  if (start === end) return { distance: 0, path: [start] };

  const gScore = new Map<NodeId, number>();
  const parent = new Map<NodeId, NodeId>();
  const settled = new Set<NodeId>();
  const handles = new Map<NodeId, PairingNode<Entry>>();
  const open = new PairingHeap<Entry>((a, b) => a.f - b.f);

  gScore.set(start, 0);
  handles.set(start, open.push({ node: start, g: 0, f: heuristic(start) }));

  while (!open.empty()) {
    const entry = open.poll()!;
    const node = entry.node;
    handles.delete(node);

    if (node === end)
      return { distance: entry.g, path: trace(parent, start, end) };

    if (settled.has(node)) continue;
    settled.add(node);

    for (const edge of graph.outEdges(node)) {
      const step = cost(edge);
      if (step < 0) throw new Negative(step, edge.id);
      if (settled.has(edge.target)) continue;

      const tentative = entry.g + step;
      const prior = gScore.get(edge.target);
      if (prior !== undefined && tentative >= prior) continue;

      gScore.set(edge.target, tentative);
      parent.set(edge.target, node);
      const f = tentative + heuristic(edge.target);

      const handle = handles.get(edge.target);
      if (handle !== undefined) {
        open.update(handle, { node: edge.target, g: tentative, f });
      } else {
        handles.set(
          edge.target,
          open.push({ node: edge.target, g: tentative, f }),
        );
      }
    }
  }

  return undefined;
}

const zero = (): number => 0;

function trace(
  parent: ReadonlyMap<NodeId, NodeId>,
  start: NodeId,
  end: NodeId,
): NodeId[] {
  const path: NodeId[] = [end];
  let current: NodeId | undefined = end;
  while (current !== start) {
    current = parent.get(current!);
    if (current === undefined) break;
    path.push(current);
  }
  path.reverse();
  return path;
}
