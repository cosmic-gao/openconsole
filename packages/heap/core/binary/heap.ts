import type { Comparator, Heap } from "../types";
import { siftDown, siftUp } from "./sift";

/**
 * 基于数组的二叉堆：常数最小的优先队列。
 *
 * `push` / `poll` / `replace` O(log n)（批量 `push` 走 Floyd 建堆，整体 O(n)），
 * `peek` O(1)，按值查找的 `delete` / `has` O(n)。
 *
 * @remarks 刻意不维护 `value -> index` 索引：那会给每次筛选步骤都加一次 Map 写入，
 *   且元素「同值」（相等原语）时索引互相覆盖会让按值删除删错元素。需要 O(log n)
 *   任意删除或 decrease-key 时用 {@link PairingHeap} 的句柄。
 */
export class BinaryHeap<T> implements Heap<T> {
  private readonly _heap: T[] = [];

  private readonly _compare: Comparator<T>;

  public constructor(compare: Comparator<T>) {
    this._compare = compare;
  }

  public get size(): number {
    return this._heap.length;
  }

  public empty(): boolean {
    return this._heap.length === 0;
  }

  public peek(): T | undefined {
    return this._heap[0];
  }

  public poll(): T | undefined {
    if (this._heap.length === 0) return undefined;
    return this._removeAt(0);
  }

  /**
   * 入堆一个或多个元素，返回入堆后的元素个数。
   *
   * @remarks 多元素走 Floyd 自下而上建堆（O(n)）；逐个 append 而非 `push(...values)`
   *   是为了避免超大展开触发调用栈溢出。
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
   * 移除首个与 `value` 严格相等的元素（线性查找）。重复元素只移除一个。
   */
  public delete(value: T): boolean {
    const index = this._heap.indexOf(value);
    if (index === -1) return false;
    this._removeAt(index);
    return true;
  }

  /** 是否包含与 `value` 严格相等的元素（线性查找）。 */
  public has(value: T): boolean {
    return this._heap.indexOf(value) !== -1;
  }

  public clear(): void {
    this._heap.length = 0;
  }

  /** 内部数组的只读拷贝（层序，非全序）；调试用。 */
  public snapshot(): readonly T[] {
    return [...this._heap];
  }

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
