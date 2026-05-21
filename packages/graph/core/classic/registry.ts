/**
 * Registry：节点 ID ↔ 稠密索引的双向映射，供 NodeIndexable trait 使用。
 */

import type { NodeId } from '../types';

/**
 * 节点 ID ↔ 稠密索引的双向映射，O(1) at / indexOf；删除采用 swap-and-pop。
 *
 * @remarks
 * 仅维护索引，不持有节点数据本身（节点存储由调用方负责）。
 *
 * **典型用途**：让算法可以用整数下标访问节点，避免反复 Map.get(NodeId)。
 * 比如 Dijkstra 维护 `dist: number[]`（按 index 索引）比 `dist: Map<NodeId, number>` 快不少。
 *
 * **稠密保证**：`_order` 始终是 [0, N) 的连续数组。删除走 swap-and-pop 维持稠密，
 * 代价是节点索引顺序在删除时**可能被打乱**（被删位置由原末尾元素填补）。
 */
export class Registry {
  /** index → NodeId（连续数组，始终稠密）。 */
  private readonly _order: NodeId[] = [];

  /** NodeId → index（O(1) 反查）。 */
  private readonly _index = new Map<NodeId, number>();

  /**
   * 追加新节点 ID，返回它的索引。
   *
   * @param nodeId 节点 ID
   * @returns 新插入位置的索引（= 旧长度）
   */
  public add(nodeId: NodeId): number {
    const idx = this._order.length;
    this._index.set(nodeId, idx);
    this._order.push(nodeId);
    return idx;
  }

  /**
   * 移除节点 ID（swap-and-pop）。
   *
   * @remarks
   * **swap-and-pop 示意**（_order = [A, B, C, D, E]，删除 B）：
   *
   *   step 1：idx = 1（B 的位置）
   *   step 2：末尾 E 搬到 idx=1 → [A, E, C, D, E]
   *   step 3：更新 _index：E → 1
   *   step 4：pop 末尾 → [A, E, C, D]
   *
   * 收益：O(1) 删除，避免 Array#splice 的 O(n) 搬移。
   * 代价：原来的 idx=1 不再是 B，而是 E。调用方不应在删除后假设 `at(i)` 仍指向同一节点。
   *
   * @param nodeId 节点 ID
   * @returns 是否实际移除
   */
  public remove(nodeId: NodeId): boolean {
    const idx = this._index.get(nodeId);
    if (idx === undefined) return false;
    const lastIdx = this._order.length - 1;
    if (idx !== lastIdx) {
      const lastId = this._order[lastIdx]!;
      this._order[idx] = lastId;
      this._index.set(lastId, idx);
    }
    this._order.pop();
    this._index.delete(nodeId);
    return true;
  }

  /** 当前节点数。 */
  public bound(): number {
    return this._order.length;
  }

  /** 按索引取节点 ID；越界返回 `undefined`。 */
  public at(index: number): NodeId | undefined {
    return this._order[index];
  }

  /** 反查节点的索引；不存在返回 -1。 */
  public indexOf(nodeId: NodeId): number {
    return this._index.get(nodeId) ?? -1;
  }

  /** 清空。 */
  public clear(): void {
    this._order.length = 0;
    this._index.clear();
  }
}
