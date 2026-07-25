/**
 * 整数下标优先队列：元素是调用方的整数下标，优先级单独给出，值留在调用方的平行数组里。
 *
 * @remarks 元素不是整数下标时用 `@openconsole/heap` 的堆。
 */
export interface IndexQueue {
  readonly size: number;

  /** 入队；重复入队同一下标的语义由实现决定。 */
  push(index: number, priority: number): void;

  /** 取出优先级最小的下标；空队列返回 `-1`。 */
  poll(): number;

  empty(): boolean;

  clear(): void;
}
