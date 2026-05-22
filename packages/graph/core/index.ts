/**
 * `@openconsole/graph` 的公共入口。
 *
 * @remarks
 * - 类型定义与算法 trait：见 {@link ./types}
 * - 运行时基础数据元模型 (Vertex、Edge、Graph、Socket 等)：见 {@link ./classic}
 * - 与存储解耦的图算法：见 {@link ./algorithms}
 * - 状态化遍历器与 DFS 事件流：见 {@link ./visitors}
 * - 反向 / 节点过滤 / 边过滤等零成本视图适配器：见 {@link ./adapters}
 * - 紧凑序列化格式：见 {@link ./serialize}
 *
 * @packageDocumentation
 */

export * from './types';
export * from './algorithms';
export * from './classic';
export * from './adapters';
export * from './visitors';
export * from './serialize';
