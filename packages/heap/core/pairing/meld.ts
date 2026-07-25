import type { Comparator } from "../types";
import type { Linked } from "./node";

/** 合并两棵非空堆序树：值较小者成为新根，另一棵挂到它的子链首位。 */
export function link<T>(
  a: Linked<T>,
  b: Linked<T>,
  compare: Comparator<T>,
): Linked<T> {
  const inverted = compare(a.value, b.value) > 0;
  const parent = inverted ? b : a;
  const attach = inverted ? a : b;

  parent.prev = null;
  attach.prev = parent;
  attach.next = parent.child;
  if (parent.child !== null) parent.child.prev = attach;
  parent.child = attach;
  return parent;
}

/** {@link link} 的可空封装：任一侧为空时直接返回另一侧。 */
export function meld<T>(
  a: Linked<T> | null,
  b: Linked<T> | null,
  compare: Comparator<T>,
): Linked<T> | null {
  if (a === null) return b;
  if (b === null) return a;
  return link(a, b, compare);
}

/**
 * 两阶段配对合并：先沿兄弟链两两 {@link link}（结果用 `prev` 临时串成单链），
 * 再自右向左累积收敛成单一根。
 *
 * @remarks 这是配对堆摊销 O(log n) 的关键——单趟合并会退化成链表，两阶段才能压平层高。
 * @param node 兄弟链的首节点，通常是某节点的 `child`
 */
export function collapse<T>(
  node: Linked<T> | null,
  compare: Comparator<T>,
): Linked<T> | null {
  if (node === null) return null;

  // 第一阶段：两两配对，结果经 prev 串成待收敛链。
  let tail: Linked<T> | null = null;
  let cursor: Linked<T> | null = node;

  while (cursor !== null) {
    // 显式标注：否则 cursor 的赋值链会让 TS 陷入循环推断。
    const first: Linked<T> = cursor;
    const second: Linked<T> | null = first.next;

    if (second === null) {
      first.prev = tail;
      tail = first;
      break;
    }

    cursor = second.next;
    first.next = null;
    second.next = null;
    const merged = link(first, second, compare);
    merged.prev = tail;
    tail = merged;
  }

  // 第二阶段：自右向左收敛。
  let result: Linked<T> | null = null;
  while (tail !== null) {
    const previous: Linked<T> | null = tail.prev;
    tail.prev = null;
    result = meld(result, tail, compare);
    tail = previous;
  }

  return result;
}
