/**
 * `@opendesign/graph` 的公共入口。
 *
 * @remarks
 * - 类型定义与算法 trait：见 {@link ./types}
 * - 运行时基础数据元模型 (Node、Edge、Graph、Socket 等)：见 {@link ./classic}
 * - 与存储解耦的图算法：见 {@link ./algorithms}
 * - 紧凑序列化格式：见 {@link ./serialize}
 *
 * @packageDocumentation
 */

export * from './types';
export * from './algorithms';
export * from './classic';
export * from './serialize';
