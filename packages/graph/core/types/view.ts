import type { EdgeId, NodeId } from './brand';

export interface EdgeView<E = unknown> {
  readonly id: EdgeId;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly weight: E | undefined;
}

export interface IntoEdges<E = unknown> {
  edgeViews(): Iterable<EdgeView<E>>;
  inEdges(node: NodeId): Iterable<EdgeView<E>>;
  outEdges(node: NodeId): Iterable<EdgeView<E>>;
}

export type EdgeOf<G> = G extends IntoEdges<infer E> ? E : unknown;
