/**
 * Hook filter 助手:把字符串 / 正则模式编译成谓词,供 tap 的 `filter` 选项使用
 * (只对命中的输入执行该 tap)。
 *
 * @example
 * ```ts
 * import { filter } from "@openconsole/plugable";
 * api.hooks.transform.tap({ name, filter: filter.id(/\.[jt]sx?$/) }, handler);
 * ```
 */

/** 字符串模式:精确串、正则,或二者数组(任一命中)。 */
export type Pattern = string | RegExp | ReadonlyArray<string | RegExp>;

/** 模式是否命中某字符串值。string=精确相等;RegExp=test;数组=任一命中。 */
export function test(pattern: Pattern, value: string): boolean {
  if (Array.isArray(pattern)) return pattern.some((item) => test(item, value));
  if (pattern instanceof RegExp) return pattern.test(value);
  return pattern === value;
}

/** 对输入的 `id` 字段做模式匹配。 */
export function id<I extends { id: string }>(pattern: Pattern): (input: I) => boolean {
  return (input) => test(pattern, input.id);
}

/** 对输入的 `code` 字段做模式匹配。 */
export function code<I extends { code: string }>(pattern: Pattern): (input: I) => boolean {
  return (input) => test(pattern, input.code);
}

/** 组合谓词:全部命中。 */
export function and<I>(...predicates: Array<(input: I) => boolean>): (input: I) => boolean {
  return (input) => predicates.every((predicate) => predicate(input));
}

/** 组合谓词:任一命中。 */
export function or<I>(...predicates: Array<(input: I) => boolean>): (input: I) => boolean {
  return (input) => predicates.some((predicate) => predicate(input));
}

/** 组合谓词:取反。 */
export function not<I>(predicate: (input: I) => boolean): (input: I) => boolean {
  return (input) => !predicate(input);
}
