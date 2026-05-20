/**
 * 访问者 (visitor) 模块。
 *
 * @remarks
 * 提供两种访问风格：
 *
 * 1. **状态化遍历器** ({@link Dfs}、{@link Bfs}、{@link Postorder}、{@link Topo})
 *    - 暴露 `next(graph)` 接口，调用方控制推进节奏；
 *    - 支持 `moveTo` / `reset` 重新开始；
 *    - 内部使用 `Set<NodeId>` 维护已访问集合，`O(1)` 查询。
 *
 * 2. **事件回调遍历** ({@link dfsVisit})
 *    - 通过 `discover` / `finish` / `treeEdge` / `backEdge` 等事件回调驱动；
 *    - 回调返回 {@link Control} 决定是否继续 / 剪枝 / 中止；
 *    - 用以编写环检测、强连通分量、支配树等高级算法。
 *
 * 两种风格可与 {@link Reversed} 适配器组合，从而在反向图上零开销复用。
 */

export * from './dfs';
export * from './postorder';
export * from './visit';
export * from './bfs';
export * from './topo';
