import type {
  Catalog,
  EdgeId,
  EdgeOf,
  EdgeView,
  IntoDegree,
  IntoEdges,
  Neighbors,
  NodeId,
  NodeIndexable,
} from '../types';
import { EMPTY, flip, hasEdges, hasIndex, nodeAt, nodeIndex } from './shared';

export class Undirected<
    G extends Catalog & Neighbors & Partial<IntoEdges<unknown>> & Partial<NodeIndexable>,
    E = EdgeOf<G>,
  >
  implements Catalog, Neighbors, IntoEdges<E>, IntoDegree, NodeIndexable
{
  private readonly _edges: boolean;
  private readonly _index: boolean;

  public constructor(public readonly inner: G) {
    this._edges = hasEdges(inner);
    this._index = hasIndex(inner);
  }

  public get order(): number {
    return this.inner.order;
  }

  public get size(): number {
    return this._edges ? this.inner.size : 0;
  }

  public nodes(): Iterable<NodeId> {
    return this.inner.nodes();
  }

  public edges(): Iterable<EdgeId> {
    return this._edges ? this.inner.edges() : EMPTY;
  }

  public *neighbors(node: NodeId): Iterable<NodeId> {
    yield* this.inner.outNeighbors(node);
    yield* this.inner.inNeighbors(node);
  }

  public inNeighbors(node: NodeId): Iterable<NodeId> {
    return this.neighbors(node);
  }

  public outNeighbors(node: NodeId): Iterable<NodeId> {
    return this.neighbors(node);
  }

  public inDegree(node: NodeId): number {
    return this._degree(node);
  }

  public outDegree(node: NodeId): number {
    return this._degree(node);
  }

  private _degree(node: NodeId): number {
    let count = 0;
    for (const _ of this.neighbors(node)) count++;
    return count;
  }

  public *edgeViews(): Iterable<EdgeView<E>> {
    if (!this._edges) return;
    for (const view of this.inner.edgeViews!()) yield view as EdgeView<E>;
  }

  public inEdges(node: NodeId): Iterable<EdgeView<E>> {
    return this.outEdges(node);
  }

  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this._edges) return;
    for (const view of this.inner.outEdges!(node)) yield view as EdgeView<E>;
    for (const view of this.inner.inEdges!(node)) yield flip(view as EdgeView<E>);
  }

  public bound(): number {
    return this._index ? this.inner.bound!() : this.inner.order;
  }

  public at(index: number): NodeId | undefined {
    return this._index ? this.inner.at!(index) : nodeAt(this.inner, index);
  }

  public indexOf(node: NodeId): number {
    return this._index ? this.inner.indexOf!(node) : nodeIndex(this.inner, node);
  }
}

export function undirected<
  G extends Catalog & Neighbors & Partial<IntoEdges<unknown>> & Partial<NodeIndexable>,
>(graph: G): Undirected<G, EdgeOf<G>> {
  return new Undirected(graph);
}
