/**
 * Registry：节点 ID ↔ 稠密索引的双向映射，供 NodeIndexable trait 使用。
 */

import type { NodeId } from '../types';

/**
 * 节点 ID ↔ 稠密索引的双向映射，O(1) at / indexOf；删除采用 swap-and-pop。
 *
 * @remarks 仅维护索引，不持有节点数据本身（节点存储由调用方负责）。
 */
export class Registry {
  /** index → NodeId（连续数组）。 */
  private readonly _order: NodeId[] = [];

  /** NodeId → index（O(1) 反查）。 */
  private readonly _index = new Map<NodeId, number>();

  /**
   * 追加新节点 ID，返回它的索引。
   *
   * @param nodeId 节点 ID
   * @returns 新插入位置的索引
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
   * @remarks 节点不在末尾时，把末尾节点搬到被删位置以保持稠密 —— 节点索引顺序
   *   **可能被打乱**。不存在时静默返回 `false`。
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
