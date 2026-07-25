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
 * 配对堆 (pairing heap)：带稳定句柄、支持 decrease-key 的优先队列。
 *
 * 复杂度：`push` / `peek` / `meld` 为 O(1)，`poll` / `delete` / `update`
 * 摊销 O(log n)。{@link PairingHeap.push} 返回的 {@link PairingNode} 可长期持有，
 * 即便 `update` 触发 increase-key，句柄也不会失效。
 *
 * @remarks 只需纯优先队列（push / poll）时用 {@link BinaryHeap}：数组布局常数更小。
 *   需要在出堆前调整优先级（Dijkstra / A\* 的 decrease-key）时用本实现。
 *
 * @typeParam T - 元素类型
 *
 * @example
 * ```ts
 * const heap = new PairingHeap<{ id: string; cost: number }>((a, b) => a.cost - b.cost);
 * const handle = heap.push({ id: "a", cost: 10 });
 * heap.update(handle, { id: "a", cost: 3 }); // decrease-key
 * heap.peek(); // { id: 'a', cost: 3 }
 * ```
 */
export class PairingHeap<T> implements Heap<T> {
  private _root: Linked<T> | null = null;

  private _size = 0;

  private readonly _compare: Comparator<T>;

  /**
   * @param compare 比较器；栈顶为比较器意义上的最小元素
   */
  public constructor(compare: Comparator<T>) {
    this._compare = compare;
  }

  /** {@inheritDoc Heap.size} */
  public get size(): number {
    return this._size;
  }

  /** {@inheritDoc Heap.empty} */
  public empty(): boolean {
    return this._size === 0;
  }

  /** {@inheritDoc Heap.peek} */
  public peek(): T | undefined {
    return this._root?.value;
  }

  /**
   * 入堆。
   *
   * @returns 该元素的句柄，可用于后续 {@link PairingHeap.update} / {@link PairingHeap.delete}
   */
  public push(value: T): PairingNode<T> {
    const node = create(value);
    this._root = meld(this._root, node, this._compare);
    this._size++;
    return node;
  }

  /** {@inheritDoc Heap.poll} */
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
   * @param handle {@link PairingHeap.push} 返回的句柄
   * @returns 是否删除成功；句柄已失效（元素早已出堆）时返回 `false` 且不改动堆
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
   * 按句柄更新元素的值。
   *
   * @remarks
   * - 值变小：标准 decrease-key（摘下子树后与根合并）；
   * - 值变大：剥离子树后把该节点作为单点重新并入，等价于「原地」delete + reinsert，
   *   **句柄在调用前后始终有效**；
   * - 值等价：只改值，不动结构。
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
      // Decrease-key：根不动，非根摘下来重新并入。
      if (node !== this._root) {
        detach(node);
        this._root = meld(this._root, node, this._compare);
      }
      return true;
    }

    // Increase-key：先剥离子树，再把单点 node 重新并入。
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

  /** {@inheritDoc Heap.clear} */
  public clear(): void {
    this._root = null;
    this._size = 0;
  }
}
