import type { Comparator } from "../types";

/**
 * 数组二叉堆的筛选原语。
 *
 * 关于 `!`：下标全部由完全二叉树不变式保证在界内，`!` 断言的是**下标有效**而非元素非空
 * ——`T` 本身可以包含 `undefined`，因此不能改用 `=== undefined` 判空。
 */

/** 上浮：逐层下移较大的祖先，最后一次性写回（写次数约为逐对 swap 的一半）。 */
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

/** 下沉：与 {@link siftUp} 对称。 */
export function siftDown<T>(
  heap: T[],
  index: number,
  compare: Comparator<T>,
): void {
  const node = heap[index]!;
  const length = heap.length;
  const half = length >> 1;
  let cursor = index;

  // cursor >= half 即无子节点。
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
