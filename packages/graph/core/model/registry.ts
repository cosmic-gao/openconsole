import type { NodeId } from "../types";

/**
 * 节点索引器：节点 id 与整数下标的双向映射，支撑 `Model` 的 `at` / `indexOf` / `bound`。
 * 子类可覆盖 `Model.createRegistry` 替换实现，见 {@link Registry} 与 {@link StableRegistry}。
 */
export interface Indexer {
  /** 返回分配到的下标。 */
  add(node: NodeId): number;
  remove(node: NodeId): boolean;
  bound(): number;
  /** 越界或空位返回 `undefined`。 */
  at(index: number): NodeId | undefined;
  /** 未登记返回 `-1`。 */
  indexOf(node: NodeId): number;
  clear(): void;
}

/**
 * 稠密下标注册表：删除走 swap-and-pop（O(1)），**会打乱下标顺序**——删除后不应依赖
 * {@link Registry.at} 的稳定性。
 */
export class Registry implements Indexer {
  private readonly _order: NodeId[] = [];
  private readonly _index = new Map<NodeId, number>();

  public add(node: NodeId): number {
    const index = this._order.length;
    this._index.set(node, index);
    this._order.push(node);
    return index;
  }

  /** 以末尾元素填补空位以保持稠密。 */
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

  public bound(): number {
    return this._order.length;
  }

  public at(index: number): NodeId | undefined {
    return this._order[index];
  }

  public indexOf(node: NodeId): number {
    return this._index.get(node) ?? -1;
  }

  public clear(): void {
    this._order.length = 0;
    this._index.clear();
  }
}

/**
 * 稳定下标注册表：删除留空位并进入 free-list 复用，下标永不移动。
 * 代价是 `bound()` 计入空位、`at()` 可能返回 `undefined`。
 */
export class StableRegistry implements Indexer {
  private readonly _slots: Array<NodeId | undefined> = [];
  private readonly _index = new Map<NodeId, number>();
  private readonly _free: number[] = [];

  /** 优先复用 free-list 里的空位。 */
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

  /** 下标留空并进入 free-list。 */
  public remove(node: NodeId): boolean {
    const index = this._index.get(node);
    if (index === undefined) return false;
    this._slots[index] = undefined;
    this._index.delete(node);
    this._free.push(index);
    return true;
  }

  /** 含空位。 */
  public bound(): number {
    return this._slots.length;
  }

  public at(index: number): NodeId | undefined {
    return this._slots[index];
  }

  public indexOf(node: NodeId): number {
    return this._index.get(node) ?? -1;
  }

  public clear(): void {
    this._slots.length = 0;
    this._index.clear();
    this._free.length = 0;
  }
}
