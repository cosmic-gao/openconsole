/**
 * 比较器：返回负数表示 `a` 应排在 `b` 之前，正数表示之后，0 表示等价。
 *
 * @remarks 两种堆都按比较器升序排列（栈顶为最小元素）；需要最大堆时反转比较器即可。
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * 堆的公共契约：两种实现共享的查询与清理操作。
 *
 * @remarks 入堆与删除的签名各实现不同（{@link BinaryHeap.push} 返回元素个数、
 *   {@link PairingHeap.push} 返回可长期持有的句柄），故不在此约束。
 *
 * @typeParam T - 元素类型
 */
export interface Heap<T> {
  /** 当前元素个数。 */
  readonly size: number;

  /** 取堆顶元素但不移除；空堆返回 `undefined`。 */
  peek(): T | undefined;

  /** 取出并移除堆顶元素；空堆返回 `undefined`。 */
  poll(): T | undefined;

  /** 是否为空堆。 */
  empty(): boolean;

  /** 清空全部元素。 */
  clear(): void;
}
