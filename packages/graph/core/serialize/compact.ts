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

/** 整图压缩格式。 */
export interface Compact {
  /** 图 ID。 */
  g: GraphId;
  /** 节点数组。 */
  n: CompactNode[];
  /** 边数组。 */
  e: CompactEdge[];
}
