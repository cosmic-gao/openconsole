/**
 * 类型声明子目录入口（品牌 ID、Socket 字典、能力 trait、访问者事件等）。
 *
 * @remarks
 * 命名约定：
 * - 类型名优先使用单个英文单词；不得已使用两词组合（如 `NodeId`、`PortId`、`EdgeView`）。
 * - 能力型 trait 用集合 / 动作的单数名词命名（{@link Catalog}、{@link Neighbors}、
 *   {@link Visitable}、{@link Walkable}）；挑不出贴切单词时保留 `Into*` 前缀
 *   （如 {@link IntoEdgeViews}、{@link IntoDegree}）。
 * - trait 方法亦优先单词形：`bound` / `at` / `marks` / `reset` / `neighbors`，
 *   方向语义通过可选 `direction` 参数传入而不是新方法。
 */

export * from './brand';
export * from './direction';
export * from './port';
export * from './view';
export * from './cycles';
export * from './degree';
export * from './catalog';
export * from './neighbors';
export * from './indexable';
export * from './visitable';
export * from './walkable';
export * from './control';
export * from './event';
