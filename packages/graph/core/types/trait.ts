import type { EdgeId, NodeId } from './brand';
import type { Direction } from './port';

export interface Catalog {
  readonly order: number;
  readonly size: number;
  nodes(): Iterable<NodeId>;
  edges(): Iterable<EdgeId>;
}

export interface Neighbors {
  neighbors(node: NodeId, direction?: Direction): Iterable<NodeId>;
  inNeighbors(node: NodeId): Iterable<NodeId>;
  outNeighbors(node: NodeId): Iterable<NodeId>;
}

export type Walkable = Catalog & Neighbors;

export interface Degree {
  inDegree: number;
  outDegree: number;
}

export interface IntoDegree {
  inDegree(node: NodeId): number;
  outDegree(node: NodeId): number;
}

export interface NodeIndexable {
  bound(): number;
  at(index: number): NodeId | undefined;
  indexOf(node: NodeId): number;
}

export interface Hierarchy {
  parent(node: NodeId): NodeId | undefined;
  children(node: NodeId): Iterable<NodeId>;
}

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
