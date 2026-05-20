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
 * 整图压缩格式。
 *
 * @remarks
 * 字段名刻意单字母（`g` / `n` / `e`）以最小化 JSON 字节体积：每条边、每个节点都不需要
 * 再多写一份字段名。属于压缩格式 schema 的有意设计，外部代码请通过 {@link pack} /
 * {@link unpack} 访问，不要直接依赖字段名。
 */
export interface Compact {
  /** 图 ID（graph）。 */
  g: GraphId;
  /** 节点数组（nodes）。 */
  n: CompactNode[];
  /** 边数组（edges）。 */
  e: CompactEdge[];
}
