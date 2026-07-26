/**
 * 声明式 filter:把"命中哪些输入"写成数据,而不是写成闭包。
 *
 * 这是 esbuild 的做法 —— `onLoad({ filter: /\.ts$/ })` 里 filter 是**数据**,引擎在跨进
 * 插件之前就判定完。同样的好处在这里成立两条:
 *
 *  1. 条件可打印、可比较、可序列化,于是 {@link Hook.taps} 的自省能直接说清"这个 tap
 *     到底管哪些输入",而不是给出一个不可读的函数;
 *  2. 条件在 `tap()` 注册时编译成单个谓词,派发热路径上只有一次调用,不再逐字段解释。
 *
 * @example
 * ```ts
 * api.hooks.transform.tap({ filter: { id: /\.[jt]sx?$/ } }, handler);
 * api.hooks.load.tap({ filter: { namespace: "virtual", id: ["@/env", "@/version"] } }, handler);
 * api.hooks.resolve.tap({ filter: (input) => input.id.length > 40 }, handler); // 逃逸口
 * ```
 */

/** 字符串模式:精确串、正则,或二者的数组(任一命中)。 */
export type Pattern = string | RegExp | ReadonlyArray<string | RegExp>;

/** 输入里可做模式匹配的字段 —— 只有字符串字段。 */
type Fields<I> = { [K in keyof I]-?: I[K] extends string | undefined ? K : never }[keyof I];

/** 声明式条件:逐字段模式匹配,**全部**命中才算命中。 */
export type Match<I> = { readonly [K in Fields<I>]?: Pattern };

/** tap 的过滤条件:声明式条件对象,或任意谓词。 */
export type Filter<I> = Match<I> | ((input: I) => boolean);

export type Predicate<I> = (input: I) => boolean;

/** 模式是否命中某字符串。串 = 精确相等;正则 = `test`;数组 = 任一命中。 */
export function test(pattern: Pattern, value: string): boolean {
  if (Array.isArray(pattern)) {
    for (const item of pattern) if (test(item, value)) return true;
    return false;
  }
  return pattern instanceof RegExp ? pattern.test(value) : pattern === value;
}

/** 非字符串字段一律不命中 —— 正则会把 `undefined` 强转成 `"undefined"`,那是静默的错答案。 */
const hits = (pattern: Pattern, value: unknown): boolean =>
  typeof value === "string" && test(pattern, value);

/**
 * 编译成谓词。谓词原样返回;条件对象在这里一次性摊平成字段列表,之后派发只走比较。
 * 空条件(`undefined` 或 `{}`)返回 `undefined`,表示"不设门",派发时连判断都省掉。
 */
export function compile<I>(filter: Filter<I> | undefined): Predicate<I> | undefined {
  if (filter === undefined) return undefined;
  if (typeof filter === "function") return filter;

  const fields = Object.entries(filter as Record<string, Pattern>);
  if (fields.length === 0) return undefined;
  // 单字段是绝大多数形态(esbuild 的 filter 就只有一个正则),特化掉数组遍历。
  if (fields.length === 1) {
    const [key, pattern] = fields[0]!;
    return (input) => hits(pattern, (input as Record<string, unknown>)[key]);
  }
  return (input) => {
    const record = input as Record<string, unknown>;
    for (const [key, pattern] of fields) if (!hits(pattern, record[key])) return false;
    return true;
  };
}

/** 恒真谓词,`compile` 给 `undefined` 时的兜底 —— 只在需要一个实体函数的地方用。 */
const always = (): boolean => true;

/** 组合:全部命中。 */
export function and<I>(...filters: Array<Filter<I>>): Predicate<I> {
  const gates = filters.map((filter) => compile(filter) ?? always);
  return (input) => gates.every((gate) => gate(input));
}

/** 组合:任一命中。 */
export function or<I>(...filters: Array<Filter<I>>): Predicate<I> {
  const gates = filters.map((filter) => compile(filter) ?? always);
  return (input) => gates.some((gate) => gate(input));
}

/** 组合:取反。 */
export function not<I>(filter: Filter<I>): Predicate<I> {
  const gate = compile(filter) ?? always;
  return (input) => !gate(input);
}
