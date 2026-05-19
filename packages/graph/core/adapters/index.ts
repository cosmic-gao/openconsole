/**
 * 图视图适配器（不复制底层数据的零成本包装）
 *
 * @remarks
 * - 适配器只做 trait 转发与方向 / 过滤翻译，不持有节点 / 边的副本；
 * - 任意实现 {@link Neighbors} / {@link IntoEdgeViews} 等 trait 的图都能被包装；
 * - 适配后的实例本身仍满足相同 trait，因此可层层嵌套（如 `Reversed(NodeFiltered(g, p))`）。
 */

export * from './predicate';
export * from './reversed';
export * from './filter';
