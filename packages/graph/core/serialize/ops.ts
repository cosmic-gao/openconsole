import type { EdgeId, JsonEdge, JsonNode, NodeId } from "../types";

/** 差异操作：新增节点。 */
export interface AddNode<N = unknown> {
  readonly kind: "addNode";
  readonly data: JsonNode<N>;
}

/** 差异操作：删除节点。 */
export interface DropNode<N = unknown> {
  readonly kind: "dropNode";
  readonly data: JsonNode<N>;
}

/** 差异操作：新增边。 */
export interface AddEdge<E = unknown> {
  readonly kind: "addEdge";
  readonly data: JsonEdge<E>;
}

/** 差异操作：删除边。 */
export interface DropEdge<E = unknown> {
  readonly kind: "dropEdge";
  readonly data: JsonEdge<E>;
}

/** 差异操作：修改节点权重，记录变更前后值以支持撤销。 */
export interface ReweightNode<N = unknown> {
  readonly kind: "setNodeWeight";
  readonly id: NodeId;
  readonly from: N | undefined;
  readonly to: N | undefined;
}

/** 差异操作：修改边权重，记录变更前后值以支持撤销。 */
export interface ReweightEdge<E = unknown> {
  readonly kind: "setEdgeWeight";
  readonly id: EdgeId;
  readonly from: E | undefined;
  readonly to: E | undefined;
}

/** 差异操作：修改节点的父节点（复合图层次），记录变更前后值以支持撤销。 */
export interface SetParent {
  readonly kind: "setParent";
  readonly node: NodeId;
  readonly from: NodeId | undefined;
  readonly to: NodeId | undefined;
}

/** 所有结构化差异操作类型的联合。 */
export type GraphOp<N = unknown, E = unknown> =
  | AddNode<N>
  | DropNode<N>
  | AddEdge<E>
  | DropEdge<E>
  | ReweightNode<N>
  | ReweightEdge<E>
  | SetParent;

/** 一组有序差异操作组成的补丁。 */
export interface GraphPatch<N = unknown, E = unknown> {
  readonly ops: ReadonlyArray<GraphOp<N, E>>;
}
