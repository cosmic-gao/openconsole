/**
 * NodeIndexable 能力：节点 ↔ 索引互转。
 */

import type { NodeId } from './brand';

/**
 * 节点可索引化 - 用于数组型算法（如 Dijkstra 的距离数组、Floyd-Warshall 的二维矩阵）。
 *
 * @remarks
 * 索引语义：
 * - {@link bound} 给出有效索引的上界（不一定等于 {@link Catalog.nodeCount}）；
 * - 索引可以是 **稀疏** 的——某些 `i ∈ [0, bound())` 处 {@link at} 返回 `undefined`；
 * - 算法应当遍历 `[0, bound())` 并自行跳过 `undefined` 槽，不要假设 `at(i)` 一定有值。
 */
export interface NodeIndexable {
  /**
   * 节点索引的上界（不含）。
   *
   * @remarks
   * 稠密实现下等于 `nodeCount()`；若实现允许墓碑槽位，可大于 `nodeCount()`。
   */
  bound(): number;
  /** 按索引获取节点 ID；越界或槽位为空时返回 `undefined`。 */
  at(index: number): NodeId | undefined;
  /** 节点的索引；不存在返回 `-1`。 */
  indexOf(nodeId: NodeId): number;
}
