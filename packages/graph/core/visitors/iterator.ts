/**
 * 内部工具：把步进函数包装为 `IterableIterator<NodeId>`。
 *
 * @internal
 */

import type { NodeId } from '../types';

/**
 * 把"步进函数"包装成 `IterableIterator<NodeId>`，
 * 用于在状态化遍历器上提供 `for...of` 语法糖。
 *
 * @internal
 */
export function toIterator(step: () => NodeId | undefined): IterableIterator<NodeId> {
  const result: IterableIterator<NodeId> = {
    [Symbol.iterator]: () => result,
    next: () => {
      const value = step();
      return value === undefined
        ? { value: undefined as unknown as NodeId, done: true }
        : { value, done: false };
    },
  };
  return result;
}
