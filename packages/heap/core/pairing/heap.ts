import type { Comparator, Heap } from "../types";
import { collapse, meld } from "./meld";
import {
  attached,
  create,
  detach,
  isolate,
  unwrap,
  type Linked,
  type PairingNode,
} from "./node";

/**
 * 配对堆：带稳定句柄、支持 decrease-key 的优先队列。
 *
 * `push` / `peek` O(1)，`poll` / `delete` / `update` 摊销 O(log n)。句柄可长期持有，
 * 即便 `update` 触发 increase-key 也不失效。
 *
 * @remarks 只需 push / poll 时用 {@link BinaryHeap}，数组布局常数更小。
 */
export class PairingHeap<T> implements Heap<T> {
  private _root: Linked<T> | null = null;

  private _size = 0;

  private readonly _compare: Comparator<T>;

  public constructor(compare: Comparator<T>) {
    this._compare = compare;
  }

  public get size(): number {
    return this._size;
  }

  public empty(): boolean {
    return this._size === 0;
  }

  public peek(): T | undefined {
    return this._root?.value;
  }

  /** 入堆，返回可用于 `update` / `delete` 的句柄。 */
  public push(value: T): PairingNode<T> {
    const node = create(value);
    this._root = meld(this._root, node, this._compare);
    this._size++;
    return node;
  }

  public poll(): T | undefined {
    const top = this._root;
    if (top === null) return undefined;

    this._root = collapse(top.child, this._compare);
    if (this._root !== null) this._root.prev = null;

    isolate(top);
    this._size--;
    return top.value;
  }

  /**
   * 按句柄删除元素。
   *
   * @returns 是否删除成功；句柄已失效时返回 `false` 且不改动堆
   */
  public delete(handle: PairingNode<T>): boolean {
    const node = unwrap(handle);
    if (!attached(node, this._root)) return false;

    if (node === this._root) {
      this.poll();
      return true;
    }

    detach(node);

    const children = collapse(node.child, this._compare);
    if (children !== null) children.prev = null;
    node.child = null;

    this._root = meld(this._root, children, this._compare);
    this._size--;
    return true;
  }

  /**
   * 按句柄更新元素的值：变小走 decrease-key，变大等价于原地 delete + reinsert
   * （句柄仍有效），等价则只改值。
   *
   * @returns 是否更新成功；句柄已失效时返回 `false` 且不改动堆
   */
  public update(handle: PairingNode<T>, value: T): boolean {
    const node = unwrap(handle);
    if (!attached(node, this._root)) return false;

    const order = this._compare(value, node.value);
    node.value = value;
    if (order === 0) return true;

    if (order < 0) {
      if (node !== this._root) {
        detach(node);
        this._root = meld(this._root, node, this._compare);
      }
      return true;
    }

    // Increase-key：剥离子树，再把单点 node 重新并入。
    const children = collapse(node.child, this._compare);
    node.child = null;
    if (children !== null) children.prev = null;

    if (node === this._root) {
      this._root = meld(children, node, this._compare);
      return true;
    }

    detach(node);
    this._root = meld(
      this._root,
      meld(children, node, this._compare),
      this._compare,
    );
    return true;
  }

  public clear(): void {
    this._root = null;
    this._size = 0;
  }
}
