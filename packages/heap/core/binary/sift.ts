import type { Comparator } from "../types";

/**
 * 数组二叉堆的两个筛选原语。抽成纯函数：不依赖类实例，可独立测试与复用。
 *
 * 关于 `!`：这两个函数内的下标全部由「完全二叉树 + `0 ≤ index < heap.length`」
 * 不变式保证在界内，`!` 断言的是**下标有效**而非元素非空——`T` 本身可以包含
 * `undefined`（`BinaryHeap<number | undefined>` 合法），因此不能改用
 * `=== undefined` 判空，否则会把合法的 `undefined` 元素误判成越界。
 */

/**
 * 上浮：把 `index` 处元素与祖先比较，逐层把较大的祖先下移，最后一次性写回。
 *
 * @remarks 相比逐对 swap，元素写次数约减半（同为 O(log n) 但常数更小）。
 */
export function siftUp<T>(
  heap: T[],
  index: number,
  compare: Comparator<T>,
): void {
  const node = heap[index]!;
  let cursor = index;

  while (cursor > 0) {
    const parentIndex = (cursor - 1) >> 1;
    const parent = heap[parentIndex]!;
    if (compare(node, parent) >= 0) break;
    heap[cursor] = parent;
    cursor = parentIndex;
  }

  heap[cursor] = node;
}

/**
 * 下沉：与 {@link siftUp} 对称，把 `index` 处元素往下换到合适层级。
 */
export function siftDown<T>(
  heap: T[],
  index: number,
  compare: Comparator<T>,
): void {
  const node = heap[index]!;
  const length = heap.length;
  const half = length >> 1;
  let cursor = index;

  // cursor >= half 意味着没有子节点，可以停止。
  while (cursor < half) {
    let childIndex = (cursor << 1) + 1;
    const rightIndex = childIndex + 1;

    if (
      rightIndex < length &&
      compare(heap[rightIndex]!, heap[childIndex]!) < 0
    ) {
      childIndex = rightIndex;
    }

    const child = heap[childIndex]!;
    if (compare(node, child) <= 0) break;

    heap[cursor] = child;
    cursor = childIndex;
  }

  heap[cursor] = node;
}
