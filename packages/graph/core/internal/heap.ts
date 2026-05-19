/**
 * 二叉最小堆：算法内部用，支持 lazy decrease-key（标记 outdated 条目，pop 时跳过）。
 */

/**
 * 通用二叉最小堆。
 *
 * @remarks
 * - 用比较函数排序（默认升序）；
 * - 不支持原地 decrease-key — 算法调用方采用"重复入堆 + 出堆时跳过过期条目"的 lazy 模式。
 *   这是 Dijkstra/Prim 的常见做法，复杂度依旧是 O((V+E) log V)，多 push 一次的开销可忽略。
 *
 * @template T 元素类型
 */
export class Heap<T> {
  private readonly _data: T[] = [];

  /**
   * @param _compare 比较函数：返回负数表示 a 优先（最小堆）。
   */
  public constructor(private readonly _compare: (a: T, b: T) => number) {}

  /** 当前元素个数。 */
  public get size(): number {
    return this._data.length;
  }

  /** 堆是否为空。 */
  public get isEmpty(): boolean {
    return this._data.length === 0;
  }

  /** 查看堆顶元素（不弹出）；空堆返回 `undefined`。 */
  public peek(): T | undefined {
    return this._data[0];
  }

  /** 推入一个元素。 */
  public push(item: T): void {
    this._data.push(item);
    this._siftUp(this._data.length - 1);
  }

  /** 弹出堆顶元素；空堆返回 `undefined`。 */
  public pop(): T | undefined {
    const data = this._data;
    if (data.length === 0) return undefined;
    const top = data[0]!;
    const last = data.pop()!;
    if (data.length > 0) {
      data[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  /**
   * 上浮：把新插入元素与父节点比较，逐层上推到正确位置。
   *
   * @internal
   */
  private _siftUp(start: number): void {
    const data = this._data;
    let i = start;
    const value = data[i]!;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const parentValue = data[parent]!;
      if (this._compare(value, parentValue) >= 0) break;
      data[i] = parentValue;
      i = parent;
    }
    data[i] = value;
  }

  /**
   * 下沉：把堆顶元素与较小子节点交换，逐层下推到正确位置。
   *
   * @internal
   */
  private _siftDown(start: number): void {
    const data = this._data;
    const n = data.length;
    let i = start;
    const value = data[i]!;
    const half = n >> 1; // 仅非叶子节点需要下沉
    while (i < half) {
      let child = (i << 1) + 1;
      const right = child + 1;
      if (right < n && this._compare(data[right]!, data[child]!) < 0) {
        child = right;
      }
      if (this._compare(data[child]!, value) >= 0) break;
      data[i] = data[child]!;
      i = child;
    }
    data[i] = value;
  }
}
