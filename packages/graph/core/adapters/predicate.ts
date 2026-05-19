/**
 * Predicate：过滤视图共享的谓词类型。
 */

/**
 * 通用谓词：返回 `true` 保留，`false` 从视图中隐去。
 *
 * @template T 被过滤的值的类型（节点过滤用 {@link NodeId}；边过滤用 {@link EdgeView}）
 */
export type Predicate<T> = (value: T) => boolean;
