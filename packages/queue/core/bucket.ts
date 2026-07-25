import type { IndexQueue } from "./types";

const NONE = -1;

/**
 * 桶队列（Dial 算法）：整数有界优先级下 `push` O(1)、`poll` 摊销 O(1)。
 *
 * 同优先级的下标挂在同一个桶里（三个 `Int32Array` 构成侵入式双向链表，零对象分配），
 * 桶以 `maxPriority + 1` 为周期循环复用——单调出队保证队列里所有优先级都落在
 * `[cursor, cursor + maxPriority]` 窗口内。下调优先级是就地重挂，不产生过期条目。
 *
 * @remarks 使用前提，违反抛 `RangeError`：优先级为非负整数、出队单调非递减、入队优先级
 *   落在当前窗口内（对 Dijkstra 即单条边权不超过 `maxPriority`）。不满足时用 `LazyQueue`。
 */
export class BucketQueue implements IndexQueue {
  private readonly _head: Int32Array;

  private readonly _next: Int32Array;

  private readonly _prev: Int32Array;

  private readonly _priority: Float64Array;

  private readonly _queued: Uint8Array;

  private readonly _width: number;

  private _cursor = 0;

  private _size = 0;

  /**
   * @param capacity 下标上界，取值范围 `0 .. capacity-1`
   * @param maxPriority 相邻两次出队之间优先级的最大增量；Dijkstra 场景即最大边权
   */
  public constructor(capacity: number, maxPriority: number) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new RangeError(
        `capacity must be a non-negative integer, got ${capacity}`,
      );
    }
    if (!Number.isInteger(maxPriority) || maxPriority < 0) {
      throw new RangeError(
        `maxPriority must be a non-negative integer, got ${maxPriority}`,
      );
    }

    this._width = maxPriority + 1;
    this._head = new Int32Array(this._width).fill(NONE);
    this._next = new Int32Array(capacity).fill(NONE);
    this._prev = new Int32Array(capacity).fill(NONE);
    this._priority = new Float64Array(capacity);
    this._queued = new Uint8Array(capacity);
  }

  public get size(): number {
    return this._size;
  }

  public empty(): boolean {
    return this._size === 0;
  }

  /** 下标当前是否在队列中。 */
  public has(index: number): boolean {
    return this._queued[index] === 1;
  }

  /**
   * 入队，或对已在队列中的下标下调优先级；优先级不更小时忽略。
   *
   * @throws RangeError 优先级不是整数，或落在当前窗口之外
   */
  public push(index: number, priority: number): void {
    if (!Number.isInteger(priority)) {
      throw new RangeError(`priority must be an integer, got ${priority}`);
    }
    if (priority < this._cursor || priority - this._cursor >= this._width) {
      throw new RangeError(
        `priority ${priority} outside window [${this._cursor}, ${this._cursor + this._width - 1}]`,
      );
    }

    if (this._queued[index] === 1) {
      if (priority >= this._priority[index]!) return;
      this._unlink(index);
    } else {
      this._queued[index] = 1;
      this._size++;
    }

    this._priority[index] = priority;
    this._link(index, priority);
  }

  public poll(): number {
    if (this._size === 0) return NONE;

    // size > 0 保证窗口内必有非空桶，游标推进有界。
    for (;;) {
      const head = this._head[this._cursor % this._width]!;
      if (head !== NONE) {
        this._unlink(head);
        this._queued[head] = 0;
        this._size--;
        return head;
      }
      this._cursor++;
    }
  }

  /** 清空并把游标归零，实例可跨多次运行复用。 */
  public clear(): void {
    // 只清桶头与在队标记：_next / _prev 仅对在队元素有意义，重新入队时必被覆写。
    this._head.fill(NONE);
    this._queued.fill(0);
    this._cursor = 0;
    this._size = 0;
  }

  private _link(index: number, priority: number): void {
    const slot = priority % this._width;
    const head = this._head[slot]!;
    this._next[index] = head;
    this._prev[index] = NONE;
    if (head !== NONE) this._prev[head] = index;
    this._head[slot] = index;
  }

  private _unlink(index: number): void {
    const prev = this._prev[index]!;
    const next = this._next[index]!;

    if (prev === NONE) {
      this._head[this._priority[index]! % this._width] = next;
    } else {
      this._next[prev] = next;
    }
    if (next !== NONE) this._prev[next] = prev;

    this._next[index] = NONE;
    this._prev[index] = NONE;
  }
}
