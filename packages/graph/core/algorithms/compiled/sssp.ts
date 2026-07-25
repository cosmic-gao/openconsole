import { BucketQueue, LazyQueue, type IndexQueue } from "@openconsole/queue";

import { Negative } from "../../model";
import type { EdgeId, NodeId } from "../../types";
import type { Csr } from "./csr";

/** 最短路径树，下标即 {@link Csr} 的节点索引。 */
export interface CsrTree {
  /** 不可达为 `Infinity`。 */
  readonly dist: Float64Array;
  /** 无前驱为 `-1`。 */
  readonly prev: Int32Array;
}

/** 超过此上界时桶数组与空桶扫描都不划算，退回 {@link LazyQueue}。 */
const BUCKET_LIMIT = 1 << 16;

/**
 * 挑选优先队列：扫一遍权重（O(E)，顺手校验负权），非负整数且有界时用
 * {@link BucketQueue}，否则用 {@link LazyQueue}。两者产出的距离一致，只影响耗时。
 */
function select(weights: Float64Array, order: number): IndexQueue {
  let integral = true;
  let max = 0;

  for (let k = 0; k < weights.length; k++) {
    const weight = weights[k]!;
    if (weight < 0) throw new Negative(weight, `e${k}` as EdgeId);
    if (integral) {
      if (Number.isInteger(weight)) {
        if (weight > max) max = weight;
      } else {
        integral = false;
      }
    }
  }

  if (integral && max <= BUCKET_LIMIT) return new BucketQueue(order, max);
  return new LazyQueue(weights.length);
}

/**
 * CSR 原生 Dijkstra：全程在整数下标空间，邻接与权重直读 typed-array——
 * 零 `EdgeView` 分配、零字符串哈希。优先队列不做 decrease-key（见 {@link select}）。
 *
 * @param target 可选终点，摸到即提前返回
 * @returns 最短路径树，配 {@link csrPath} 重建路径
 * @throws Error CSR 未携带权重
 * @throws Negative 存在负权边
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

  const outOffsets = csr.outOffsets;
  const outTargets = csr.outTargets;

  const s = csr.indexOf(source);
  if (s < 0) return { dist, prev };
  const t = target === undefined ? -1 : csr.indexOf(target);

  const queue = select(weights, n);
  dist[s] = 0;
  queue.push(s, 0);

  for (let u = queue.poll(); u !== -1; u = queue.poll()) {
    // 下标首次出队时携带的必是其最小距离，其余条目一律过期。
    if (settled[u] === 1) continue;
    settled[u] = 1;
    if (u === t) break;

    const base = dist[u]!;
    const start = outOffsets[u]!;
    const end = outOffsets[u + 1]!;
    for (let k = start; k < end; k++) {
      const v = outTargets[k]!;
      if (settled[v] === 1) continue;
      const candidate = base + weights[k]!;
      if (candidate < dist[v]!) {
        dist[v] = candidate;
        prev[v] = u;
        queue.push(v, candidate);
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
