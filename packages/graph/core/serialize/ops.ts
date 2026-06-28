import type { EdgeId, JsonEdge, JsonNode, NodeId } from '../types';

export interface AddNode<N = unknown> {
  readonly kind: 'addNode';
  readonly data: JsonNode<N>;
}

export interface DropNode<N = unknown> {
  readonly kind: 'dropNode';
  readonly data: JsonNode<N>;
}

export interface AddEdge<E = unknown> {
  readonly kind: 'addEdge';
  readonly data: JsonEdge<E>;
}

export interface DropEdge<E = unknown> {
  readonly kind: 'dropEdge';
  readonly data: JsonEdge<E>;
}

export interface ReweightNode<N = unknown> {
  readonly kind: 'setNodeWeight';
  readonly id: NodeId;
  readonly from: N | undefined;
  readonly to: N | undefined;
}

export interface ReweightEdge<E = unknown> {
  readonly kind: 'setEdgeWeight';
  readonly id: EdgeId;
  readonly from: E | undefined;
  readonly to: E | undefined;
}

export type GraphOp<N = unknown, E = unknown> =
  | AddNode<N>
  | DropNode<N>
  | AddEdge<E>
  | DropEdge<E>
  | ReweightNode<N>
  | ReweightEdge<E>;

export interface GraphPatch<N = unknown, E = unknown> {
  readonly ops: ReadonlyArray<GraphOp<N, E>>;
}
