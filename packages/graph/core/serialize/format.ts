import type { PortTuple } from "../support";
import type { EdgeId, GraphId, NodeId, PortId } from "../types";

/** 节点的紧凑元组格式：[节点 ID, 权重, 输入端口, 输出端口]。 */
export type CompactNode = [
  NodeId,
  unknown,
  ReadonlyArray<PortTuple> | null,
  ReadonlyArray<PortTuple> | null,
];

/** 边的紧凑元组格式：[边 ID, 源节点, 源端口, 目标节点, 目标端口, 权重]。 */
export type CompactEdge = [EdgeId, NodeId, PortId, NodeId, PortId, unknown];

/** 紧凑序列化的 schema 版本号。 */
export const VERSION = 1 as const;

/** 图的紧凑序列化结果：版本、图 ID、节点、边，以及可选的复合图层次关系 h。 */
export interface Compact {
  v: number;
  g: GraphId;
  n: CompactNode[];
  e: CompactEdge[];
  h?: Array<[NodeId, NodeId]>;
}
