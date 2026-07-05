import type { NodeId } from "../types";
import type { Csr } from "./csr";

/** top-down 切换到 bottom-up 的边数阈值系数（Beamer 经验值）。 */
const ALPHA = 15;
/** bottom-up 切回 top-down 的前沿顶点数阈值系数（Beamer 经验值）。 */
const BETA = 24;

/**
 * CSR 上的方向优化 BFS（Beamer direction-optimizing），返回各节点到起点集的最短跳数（层级）。
 *
 * 稀疏前沿走 top-down（push：从前沿扫出边发现新点），稠密前沿切到 bottom-up
 * （pull：未访问点反查入边是否命中前沿），二者按边数/前沿规模的启发式动态切换——
 * 大图上显著快于单向 BFS。方向切换只影响耗时，**不影响结果**（层级恒为有向最短跳数）。
 *
 * 需要双向邻接，仅接受 {@link Csr} 快照（同时具备 `outTargets` / `inTargets`）。
 *
 * @param csr CSR 快照。
 * @param sources 起点集合（多源 BFS，起点层级为 0）。
 * @returns 长度为 `csr.order` 的层级数组，下标即节点索引；不可达为 -1。
 */
export function bfsLevels(csr: Csr, sources: Iterable<NodeId>): Int32Array {
  const n = csr.order;
  const outOffsets = csr.outOffsets;
  const outTargets = csr.outTargets;
  const inOffsets = csr.inOffsets;
  const inTargets = csr.inTargets;

  const level = new Int32Array(n).fill(-1);
  let bitsCurr = new Uint8Array(n);
  let bitsNext = new Uint8Array(n);
  let frontier: number[] = [];

  const outDegree = (v: number): number => outOffsets[v + 1]! - outOffsets[v]!;

  const edges = outTargets.length;
  let unexplored = edges; // 未访问顶点的出边数（bottom-up 代价估计）

  for (const source of sources) {
    const i = csr.indexOf(source);
    if (i >= 0 && level[i]! === -1) {
      level[i] = 0;
      bitsCurr[i] = 1;
      frontier.push(i);
      unexplored -= outDegree(i);
    }
  }

  let depth = 0;
  let topDown = true;

  while (frontier.length > 0) {
    let frontierEdges = 0;
    for (let f = 0; f < frontier.length; f++) frontierEdges += outDegree(frontier[f]!);

    if (topDown && frontierEdges > unexplored / ALPHA) topDown = false;
    else if (!topDown && frontier.length < n / BETA) topDown = true;

    const next: number[] = [];

    if (topDown) {
      for (let f = 0; f < frontier.length; f++) {
        const u = frontier[f]!;
        const start = outOffsets[u]!;
        const end = outOffsets[u + 1]!;
        for (let k = start; k < end; k++) {
          const v = outTargets[k]!;
          if (level[v]! === -1) {
            level[v] = depth + 1;
            bitsNext[v] = 1;
            next.push(v);
            unexplored -= outDegree(v);
          }
        }
      }
    } else {
      for (let v = 0; v < n; v++) {
        if (level[v]! !== -1) continue;
        const start = inOffsets[v]!;
        const end = inOffsets[v + 1]!;
        for (let k = start; k < end; k++) {
          if (bitsCurr[inTargets[k]!] === 1) {
            level[v] = depth + 1;
            bitsNext[v] = 1;
            next.push(v);
            unexplored -= outDegree(v);
            break;
          }
        }
      }
    }

    // 清空当前前沿位图以复用为下一轮的 next 位图（仅清置位项，O(前沿)）。
    for (let f = 0; f < frontier.length; f++) bitsCurr[frontier[f]!] = 0;
    const tmp = bitsCurr;
    bitsCurr = bitsNext;
    bitsNext = tmp;
    frontier = next;
    depth++;
  }

  return level;
}
