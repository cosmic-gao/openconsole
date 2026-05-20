/**
 * GraphPatch 操作类型：diff / apply / invert 的可序列化数据形态。
 *
 * @remarks 命名约定：op 类型采用"动词 + 主体"两词命名（如 {@link AddNode}、
 *   {@link ReweightNode}），父联合类型 {@link GraphOp} 表达"operation"语义，
 *   因此不再额外加 `Op` 后缀。
 */

import type { EdgeId, JsonEdge, JsonNode, NodeId } from '../types';

/** 新增节点：携带完整端口 / 权重快照，确保 apply 时可独立重建节点。 */
export interface AddNode<N = unknown> {
  readonly kind: 'addNode';
  readonly data: JsonNode<N>;
}

/** 删除节点：携带完整快照供 {@link invert} 还原。 */
export interface RemoveNode<N = unknown> {
  readonly kind: 'removeNode';
  readonly data: JsonNode<N>;
}

/** 新增边：依赖目标图中已存在所需节点 + 端口（addNode 应先于 addEdge 应用）。 */
export interface AddEdge<E = unknown> {
  readonly kind: 'addEdge';
  readonly data: JsonEdge<E>;
}

/** 删除边。 */
export interface RemoveEdge<E = unknown> {
  readonly kind: 'removeEdge';
  readonly data: JsonEdge<E>;
}

/** 节点权重更新（reweight = 重新赋权）。 */
export interface ReweightNode<N = unknown> {
  readonly kind: 'setNodeWeight';
  readonly id: NodeId;
  readonly from: N | undefined;
  readonly to: N | undefined;
}

/** 边权重更新。 */
export interface ReweightEdge<E = unknown> {
  readonly kind: 'setEdgeWeight';
  readonly id: EdgeId;
  readonly from: E | undefined;
  readonly to: E | undefined;
}

/** 单一图操作。 */
export type GraphOp<N = unknown, E = unknown> =
  | AddNode<N>
  | RemoveNode<N>
  | AddEdge<E>
  | RemoveEdge<E>
  | ReweightNode<N>
  | ReweightEdge<E>;

/** 操作序列（patch）。 */
export interface GraphPatch<N = unknown, E = unknown> {
  readonly ops: ReadonlyArray<GraphOp<N, E>>;
}
