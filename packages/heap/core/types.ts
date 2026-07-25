/**
 * 比较器：返回负数表示 `a` 排在 `b` 之前，正数表示之后，0 表示等价。
 *
 * @remarks 两种堆都按比较器升序排列（栈顶为最小元素），反转比较器即得最大堆。
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * 堆的公共契约。入堆与删除的签名各实现不同，不在此约束。
 */
export interface Heap<T> {
  readonly size: number;

  /** 取堆顶但不移除；空堆返回 `undefined`。 */
  peek(): T | undefined;

  /** 取出并移除堆顶；空堆返回 `undefined`。 */
  poll(): T | undefined;

  empty(): boolean;

  clear(): void;
}
