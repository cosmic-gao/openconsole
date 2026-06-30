import type { NodeId } from "../types";

/**
 * 节点注册表：维护节点 id 到稠密整数下标的双向映射，供矩阵类算法使用。
 */
export class Registry {
  private readonly _order: NodeId[] = [];
  private readonly _index = new Map<NodeId, number>();

  /**
   * 登记一个节点。
   *
   * @returns 分配给该节点的下标
   */
  public add(node: NodeId): number {
    const index = this._order.length;
    this._index.set(node, index);
    this._order.push(node);
    return index;
  }

  /**
   * 移除一个节点（以末尾元素填补空位以保持稠密）。
   *
   * @returns 存在并移除返回 `true`，否则 `false`
   */
  public remove(node: NodeId): boolean {
    const index = this._index.get(node);
    if (index === undefined) return false;
    const lastIndex = this._order.length - 1;
    if (index !== lastIndex) {
      const last = this._order[lastIndex]!;
      this._order[index] = last;
      this._index.set(last, index);
    }
    this._order.pop();
    this._index.delete(node);
    return true;
  }

  /** 当前登记的节点数量（即下标上界）。 */
  public bound(): number {
    return this._order.length;
  }

  /** 按下标取节点 id，越界返回 `undefined`。 */
  public at(index: number): NodeId | undefined {
    return this._order[index];
  }

  /** 取节点下标，未登记返回 `-1`。 */
  public indexOf(node: NodeId): number {
    return this._index.get(node) ?? -1;
  }

  /** 清空注册表。 */
  public clear(): void {
    this._order.length = 0;
    this._index.clear();
  }
}
