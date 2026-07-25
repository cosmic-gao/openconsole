import type { Comparator, Heap } from "../types";
import { siftDown, siftUp } from "./sift";

/**
 * 基于数组的二叉堆：定位快、常数小的优先队列。
 *
 * 复杂度：`push` / `poll` / `replace` 为 O(log n)（批量 `push` 走 Floyd 建堆，整体 O(n)），
 * `peek` 为 O(1)，按值查找的 {@link BinaryHeap.delete} / {@link BinaryHeap.has} 为 O(n)。
 *
 * @remarks 需要 O(log n) 的任意删除或 decrease-key 时用 {@link PairingHeap}：
 *   它的 `push` 返回可长期持有的句柄。本实现刻意不维护 `value -> index` 索引——
 *   那会给每次筛选步骤都加上一次 Map 写入，并且在元素“同值”（相等原语）时
 *   索引会互相覆盖，使按值删除删错元素。
 *
 * @typeParam T - 元素类型
 *
 * @example
 * ```ts
 * const heap = new BinaryHeap<number>((a, b) => a - b);
 * heap.push(3, 1, 2);
 * heap.poll(); // 1
 * ```
 */
export class BinaryHeap<T> implements Heap<T> {
  private readonly _heap: T[] = [];

  private readonly _compare: Comparator<T>;

  /**
   * @param compare 比较器；栈顶为比较器意义上的最小元素
   */
  public constructor(compare: Comparator<T>) {
    this._compare = compare;
  }

  /** {@inheritDoc Heap.size} */
  public get size(): number {
    return this._heap.length;
  }

  /** {@inheritDoc Heap.empty} */
  public empty(): boolean {
    return this._heap.length === 0;
  }

  /** {@inheritDoc Heap.peek} */
  public peek(): T | undefined {
    return this._heap[0];
  }

  /** {@inheritDoc Heap.poll} */
  public poll(): T | undefined {
    if (this._heap.length === 0) return undefined;
    return this._removeAt(0);
  }

  /**
   * 入堆一个或多个元素。
   *
   * @remarks 单元素走一次 sift-up；多元素先整体追加再 Floyd 自下而上建堆（O(n)），
   *   比逐个 sift-up 更省比较次数。逐个 `push` 而非 `push(...values)` 是为了
   *   避免超大展开在部分引擎上触发调用栈溢出。
   *
   * @returns 入堆后的元素个数
   */
  public push(...values: T[]): number {
    const heap = this._heap;
    const count = values.length;
    if (count === 0) return heap.length;

    if (count === 1) {
      heap.push(values[0]!);
      siftUp(heap, heap.length - 1, this._compare);
      return heap.length;
    }

    for (let i = 0; i < count; i++) heap.push(values[i]!);
    for (let i = (heap.length >> 1) - 1; i >= 0; i--) {
      siftDown(heap, i, this._compare);
    }
    return heap.length;
  }

  /**
   * 弹出堆顶并压入 `value`，只需一次 sift-down。
   *
   * @returns 被替换掉的原堆顶；空堆时直接入堆并返回 `undefined`
   */
  public replace(value: T): T | undefined {
    const heap = this._heap;
    if (heap.length === 0) {
      heap.push(value);
      return undefined;
    }

    const top = heap[0]!;
    heap[0] = value;
    siftDown(heap, 0, this._compare);
    return top;
  }

  /**
   * 移除首个与 `value` 严格相等的元素。
   *
   * @remarks 线性查找 O(n)；重复元素只移除一个。`NaN` 无法按值定位（严格相等语义）。
   * @returns 是否移除了元素
   */
  public delete(value: T): boolean {
    const index = this._heap.indexOf(value);
    if (index === -1) return false;
    this._removeAt(index);
    return true;
  }

  /**
   * 是否包含与 `value` 严格相等的元素（线性查找 O(n)）。
   */
  public has(value: T): boolean {
    return this._heap.indexOf(value) !== -1;
  }

  /** {@inheritDoc Heap.clear} */
  public clear(): void {
    this._heap.length = 0;
  }

  /**
   * 内部数组的只读快照（按堆的层序，非全序）；调试 / 断言用。
   *
   * @remarks 返回拷贝且类型只读：外部无法借此改动堆内部状态。
   */
  public snapshot(): readonly T[] {
    return [...this._heap];
  }

  /**
   * 移除 `index` 处元素：用末尾元素补位，再按需上浮或下沉。
   *
   * @returns 被移除的元素
   */
  private _removeAt(index: number): T {
    const heap = this._heap;
    const lastIndex = heap.length - 1;
    const removed = heap[index]!;

    if (index === lastIndex) {
      heap.pop();
      return removed;
    }

    heap[index] = heap[lastIndex]!;
    heap.pop();

    // 补位元素可能比原位置更小（需上浮）也可能更大（需下沉）。
    const parentIndex = (index - 1) >> 1;
    if (index > 0 && this._compare(heap[index]!, heap[parentIndex]!) < 0) {
      siftUp(heap, index, this._compare);
    } else {
      siftDown(heap, index, this._compare);
    }

    return removed;
  }
}
