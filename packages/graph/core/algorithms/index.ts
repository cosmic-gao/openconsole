/**
 * 图算法模块。
 *
 * @remarks
 * 算法仅依赖访问者 trait（{@link Catalog} / {@link Neighbors} /
 * {@link IntoEdges} / {@link IntoDegree} 等），与具体存储解耦。
 */

export * from './toposort';
export * from './incremental';
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
export * from './bidijkstra';
export * from './astar';
export * from './bridges';
export * from './dominator';
export * from './csr';
export * from './weighted';
