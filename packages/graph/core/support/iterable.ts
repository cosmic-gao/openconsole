/** 空可迭代对象：供缺失能力的视图与空集合复用，避免每次分配。 */
export const EMPTY: Iterable<never> = {
  *[Symbol.iterator]() {},
};

/** 数出可迭代对象的元素个数。 */
export function count(items: Iterable<unknown>): number {
  let total = 0;
  for (const _ of items) total++;
  return total;
}
