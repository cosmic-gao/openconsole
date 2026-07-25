import type { IndexQueue } from "./types";

const INITIAL = 32;

/**
 * 惰性整数下标优先队列：二叉堆存 `(priority, index)` 对，允许同一下标有多个条目。
 *
 * 优先级下调时不做 decrease-key，而是追加一条新条目；旧条目成为过期条目，出队时由
 * 调用方的 settled 位图跳过——下标首次出队时携带的必然是它的最小优先级。
 *
 * `push` / `poll` 均 O(log k)，k 为条目数（最坏为边数）。
 */
export class LazyQueue implements IndexQueue {
  private _priority: Float64Array;

  private _index: Int32Array;

  private _size = 0;

  /** @param capacity 初始条目容量，不足时自动翻倍 */
  public constructor(capacity: number = INITIAL) {
    const initial = Math.max(INITIAL, capacity | 0);
    this._priority = new Float64Array(initial);
    this._index = new Int32Array(initial);
  }

  public get size(): number {
    return this._size;
  }

  public empty(): boolean {
    return this._size === 0;
  }

  /** 追加一条条目；不检查下标是否已在队列中。 */
  public push(index: number, priority: number): void {
    if (this._size === this._index.length) this._grow();

    const priorities = this._priority;
    const indices = this._index;

    let cursor = this._size++;
    while (cursor > 0) {
      const parent = (cursor - 1) >> 1;
      if (priorities[parent]! <= priority) break;
      priorities[cursor] = priorities[parent]!;
      indices[cursor] = indices[parent]!;
      cursor = parent;
    }
    priorities[cursor] = priority;
    indices[cursor] = index;
  }

  public poll(): number {
    if (this._size === 0) return -1;

    const priorities = this._priority;
    const indices = this._index;
    const top = indices[0]!;

    const last = --this._size;
    if (last === 0) return top;

    const priority = priorities[last]!;
    const index = indices[last]!;

    let cursor = 0;
    const half = last >> 1;
    while (cursor < half) {
      let child = (cursor << 1) + 1;
      const right = child + 1;
      if (right < last && priorities[right]! < priorities[child]!)
        child = right;
      if (priority <= priorities[child]!) break;
      priorities[cursor] = priorities[child]!;
      indices[cursor] = indices[child]!;
      cursor = child;
    }
    priorities[cursor] = priority;
    indices[cursor] = index;

    return top;
  }

  /** 查看优先级最小的下标但不出队；空队列返回 `-1`。 */
  public peek(): number {
    return this._size === 0 ? -1 : this._index[0]!;
  }

  public clear(): void {
    this._size = 0;
  }

  private _grow(): void {
    const capacity = this._index.length * 2;
    const priority = new Float64Array(capacity);
    const index = new Int32Array(capacity);
    priority.set(this._priority);
    index.set(this._index);
    this._priority = priority;
    this._index = index;
  }
}
