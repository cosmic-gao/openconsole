/**
 * 紧凑序列化格式的数据类型定义。
 */

import type { EdgeId, GraphId, NodeId, PortId } from '../types';

/** 节点压缩元组。 */
export type CompactNode = [
  /** 节点 ID。 */
  NodeId,
  /** 节点权重。 */
  unknown,
  /** 输入端口数组（无端口时为 `null`）。 */
  ReadonlyArray<[string, PortId, string]> | null,
  /** 输出端口数组（无端口时为 `null`）。 */
  ReadonlyArray<[string, PortId, string]> | null,
];

/** 边压缩元组。 */
export type CompactEdge = [
  /** 边 ID。 */
  EdgeId,
  /** 源节点 ID。 */
  NodeId,
  /** 源端口 ID。 */
  PortId,
  /** 目标节点 ID。 */
  NodeId,
  /** 目标端口 ID。 */
  PortId,
  /** 边权重。 */
  unknown,
];

/**
 * 当前紧凑格式的 schema 版本号。
 *
 * @remarks
 * 单调递增；字段加减或语义变更都应升级。{@link unpack} 校验后才进入实际反序列化；
 * 不匹配抛 {@link Schema}。protobuf 风格的"字段编号永不复用"约束此处通过整版本号简化。
 */
export const VERSION = 1 as const;

/**
 * 整图压缩格式。
 *
 * @remarks
 * 字段名刻意单字母（`v` / `g` / `n` / `e`）以最小化 JSON 字节体积：每条边、每个节点都不需要
 * 再多写一份字段名。属于压缩格式 schema 的有意设计，外部代码请通过 {@link pack} /
 * {@link unpack} 访问，不要直接依赖字段名。
 */
export interface Compact {
  /** schema 版本（version）。 */
  v: number;
  /** 图 ID（graph）。 */
  g: GraphId;
  /** 节点数组（nodes）。 */
  n: CompactNode[];
  /** 边数组（edges）。 */
  e: CompactEdge[];
}
