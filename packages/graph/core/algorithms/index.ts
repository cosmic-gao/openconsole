/**
 * 图算法模块。
 *
 * @remarks
 * 算法仅依赖访问者 trait（{@link Catalog} / {@link Neighbors} /
 * {@link IntoEdgeViews} / {@link IntoDegree} 等），与具体存储解耦。
 */

export * from './toposort';
export * from './dfs';
export * from './bfs';
export * from './scc';
export * from './postorder';
export * from './kosaraju';
export * from './condensation';
export * from './reachable';
export * from './degree';
export * from './neighborhood';
export * from './dijkstra';
export * from './weighted';
