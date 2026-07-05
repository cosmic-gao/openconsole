import type { NodeId } from "../types";

/**
 * 节点索引器：节点 id 与整数下标的双向映射。{@link Model} 通过它支撑 `at` / `indexOf` / `bound`，
 * 子类可覆盖 `Model` 的工厂方法以替换实现（见 {@link Registry} 与 {@link StableRegistry}）。
 */
export interface Indexer {
  /** 登记节点，返回其下标。 */
  add(node: NodeId): number;
  /** 移除节点，成功返回 `true`。 */
  remove(node: NodeId): boolean;
  /** 下标上界。 */
  bound(): number;
  /** 按下标取节点，越界或空位返回 `undefined`。 */
  at(index: number): NodeId | undefined;
  /** 取节点下标，不存在返回 `-1`。 */
  indexOf(node: NodeId): number;
  /** 清空。 */
  clear(): void;
}

/**
 * 节点注册表：维护节点 id 到稠密整数下标的双向映射，供矩阵类算法使用。
 * 删除走 swap-and-pop（O(1)），但会打乱下标顺序——删除后不应依赖 {@link Registry.at} 的稳定性。
 */
export class Registry implements Indexer {
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

/**
 * 稳定注册表：删除留空位并进入 free-list 复用，下标永不移动。
 * 相比 {@link Registry} 的 swap-and-pop，删除后 {@link StableRegistry.at} 保持稳定，
 * 代价是空位不回收（后续新增优先填补）、{@link StableRegistry.bound} 计入空位。
 */
export class StableRegistry implements Indexer {
  private readonly _slots: Array<NodeId | undefined> = [];
  private readonly _index = new Map<NodeId, number>();
  private readonly _free: number[] = [];

  /**
   * 登记一个节点，优先复用空位。
   *
   * @returns 分配给该节点的下标
   */
  public add(node: NodeId): number {
    const reused = this._free.pop();
    if (reused !== undefined) {
      this._slots[reused] = node;
      this._index.set(node, reused);
      return reused;
    }
    const index = this._slots.length;
    this._slots.push(node);
    this._index.set(node, index);
    return index;
  }

  /**
   * 移除一个节点，其下标留空并进入 free-list。
   *
   * @returns 存在并移除返回 `true`，否则 `false`
   */
  public remove(node: NodeId): boolean {
    const index = this._index.get(node);
    if (index === undefined) return false;
    this._slots[index] = undefined;
    this._index.delete(node);
    this._free.push(index);
    return true;
  }

  /** 下标上界（含空位）。 */
  public bound(): number {
    return this._slots.length;
  }

  /** 按下标取节点 id，越界或空位返回 `undefined`。 */
  public at(index: number): NodeId | undefined {
    return this._slots[index];
  }

  /** 取节点下标，未登记返回 `-1`。 */
  public indexOf(node: NodeId): number {
    return this._index.get(node) ?? -1;
  }

  /** 清空注册表。 */
  public clear(): void {
    this._slots.length = 0;
    this._index.clear();
    this._free.length = 0;
  }
}
