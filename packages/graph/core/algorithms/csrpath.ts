import { PairingHeap, type PairingNode } from "@openconsole/heap";

import { Negative } from "../classic";
import type { EdgeId, NodeId } from "../types";
import type { Csr } from "./csr";

interface Reach {
  readonly i: number;
  readonly dist: number;
}

/** CSR 原生最短路径树：距离与前驱均以内部整数下标表示（与 {@link Csr.at} 对应）。 */
export interface CsrTree {
  /** 各节点到起点的最短距离，下标即节点索引；不可达为 Infinity。 */
  readonly dist: Float64Array;
  /** 各节点的前驱节点索引，下标即节点索引；无前驱为 -1。 */
  readonly prev: Int32Array;
}

/**
 * CSR 原生 Dijkstra：直接在 {@link Csr} 的 typed-array 邻接与预烘焙权重上运行。
 *
 * 相比通用 {@link dijkstra}，全程在整数下标空间：距离/访问/前驱用 typed-array，
 * 邻接与权重直读 `outTargets` / `weights`——**零 `EdgeView` 对象分配、零字符串哈希**。
 * 适合「编译一次、同一快照上多次跑」的热路径。权重取自编译期 `csr(graph, weight)`。
 *
 * @param csr 已带权编译的 CSR 快照（需 `csr(graph, weight)` 生成）。
 * @param source 起点节点。
 * @param target 可选终点；摸到即提前返回。
 * @returns 整数下标表示的最短路径树，配 {@link csrPath} 重建路径。
 * @throws Error 当 CSR 未携带权重时抛出。
 * @throws Negative 当遇到负权时抛出。
 */
export function sssp(csr: Csr, source: NodeId, target?: NodeId): CsrTree {
  const weights = csr.weights;
  if (!weights) {
    throw new Error(
      "sssp requires a weighted CSR; compile with csr(graph, weight)",
    );
  }

  const n = csr.order;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const settled = new Uint8Array(n);
  const handles = new Array<PairingNode<Reach> | undefined>(n);

  const outOffsets = csr.outOffsets;
  const outTargets = csr.outTargets;

  const s = csr.indexOf(source);
  if (s < 0) return { dist, prev };
  const t = target === undefined ? -1 : csr.indexOf(target);

  const heap = new PairingHeap<Reach>((a, b) => a.dist - b.dist);
  dist[s] = 0;
  handles[s] = heap.push({ i: s, dist: 0 });

  while (!heap.empty()) {
    const top = heap.poll()!;
    const u = top.i;
    handles[u] = undefined;
    if (settled[u] === 1) continue;
    settled[u] = 1;
    if (u === t) break;

    const start = outOffsets[u]!;
    const end = outOffsets[u + 1]!;
    for (let k = start; k < end; k++) {
      const v = outTargets[k]!;
      if (settled[v] === 1) continue;
      const cost = weights[k]!;
      if (cost < 0) throw new Negative(cost, `e${k}` as EdgeId);
      const candidate = top.dist + cost;
      if (candidate < dist[v]!) {
        dist[v] = candidate;
        prev[v] = u;
        const handle = handles[v];
        if (handle !== undefined) heap.update(handle, { i: v, dist: candidate });
        else handles[v] = heap.push({ i: v, dist: candidate });
      }
    }
  }

  return { dist, prev };
}

/**
 * 从 {@link sssp} 的结果重建 source 到 target 的节点序列；不可达返回空数组。
 */
export function csrPath(csr: Csr, tree: CsrTree, target: NodeId): NodeId[] {
  const t = csr.indexOf(target);
  if (t < 0 || tree.dist[t]! === Infinity) return [];
  const result: NodeId[] = [];
  for (let cursor = t; cursor !== -1; cursor = tree.prev[cursor]!) {
    result.push(csr.at(cursor)!);
  }
  return result.reverse();
}
