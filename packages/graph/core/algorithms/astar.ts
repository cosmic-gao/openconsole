/**
 * astar：A* 启发式单源单汇最短路径（consistent heuristic 时给出最优解）。
 */

import { PairingHeap, type PairingNode } from '@opendesign/heap';

import { Negative } from '../classic';
import type { Catalog, EdgeView, IntoEdges, NodeId } from '../types';

/** 堆中的待处理项：节点 + 当前已知 g（从起点的真实代价）+ f（g + 启发值）。 */
interface Entry {
  readonly node: NodeId;
  readonly g: number;
  readonly f: number;
}

/**
 * A* 启发式最短路径（适用 consistent / monotone heuristic）。
 *
 * @remarks
 * Dijkstra 是 `heuristic = 0` 的特例：当启发值恒为 0 时，f = g，退化为标准 Dijkstra。
 * 给出一个合理的启发函数（如欧氏距离 / Manhattan 距离 / Landmark 下界）可在大型空间图上
 * 把扩展节点数压缩一个数量级以上。
 *
 * **启发函数约束**：
 * - `admissible`：`h(v) ≤ realDist(v, end)`（不高估）— 保证返回最优解
 * - `consistent`（更严）：`h(u) ≤ cost(u, v) + h(v)` — 还保证每个节点只 settle 一次（同 Dijkstra）
 *
 * 不一致但仍 admissible 的启发函数也能给出最优解，但同一节点可能被多次松弛（性能略降）。
 *
 * @template E 边权重类型
 * @template G 满足 {@link Catalog} + {@link IntoEdges} 的图类型
 * @param graph 图实例
 * @param start 起点
 * @param end 终点
 * @param cost 边代价函数，必须返回非负数
 * @param heuristic 启发函数；缺省恒为 0（退化为 Dijkstra）
 * @returns `{ distance, path }`；不可达时返回 `undefined`
 * @throws {Negative} `cost` 返回负数
 *
 * @see Hart, P.E.; Nilsson, N.J.; Raphael, B. (1968). "A Formal Basis for the Heuristic
 *   Determination of Minimum Cost Paths." IEEE Trans. on Systems Science and Cybernetics 4(2).
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

    if (node === end) return { distance: entry.g, path: trace(parent, start, end) };

    if (settled.has(node)) continue;
    settled.add(node);

    for (const edge of graph.getOutgoing(node)) {
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
        handles.set(edge.target, open.push({ node: edge.target, g: tentative, f }));
      }
    }
  }

  return undefined;
}

/** 默认启发：恒为 0，让 A* 退化为 Dijkstra。 */
const zero = (): number => 0;

/**
 * 沿 parent 链从 end 回溯到 start，反转为正向路径。
 *
 * @internal
 */
function trace(parent: ReadonlyMap<NodeId, NodeId>, start: NodeId, end: NodeId): NodeId[] {
  const path: NodeId[] = [end];
  let cur: NodeId | undefined = end;
  while (cur !== start) {
    cur = parent.get(cur!);
    if (cur === undefined) break;
    path.push(cur);
  }
  path.reverse();
  return path;
}
