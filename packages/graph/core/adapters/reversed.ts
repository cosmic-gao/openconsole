import type {
  Catalog,
  Direction,
  EdgeId,
  EdgeOf,
  EdgeView,
  IntoDegree,
  IntoEdges,
  Neighbors,
  NodeId,
  NodeIndexable,
} from '../types';
import { EMPTY, flip, hasDegree, hasEdges, hasIndex, nodeAt, nodeIndex } from './shared';

export class Reversed<
    G extends Catalog &
      Neighbors &
      Partial<IntoEdges<unknown>> &
      Partial<IntoDegree> &
      Partial<NodeIndexable>,
    E = EdgeOf<G>,
  >
  implements Catalog, Neighbors, IntoEdges<E>, IntoDegree, NodeIndexable
{
  private readonly _edges: boolean;
  private readonly _degree: boolean;
  private readonly _index: boolean;

  public constructor(public readonly inner: G) {
    this._edges = hasEdges(inner);
    this._degree = hasDegree(inner);
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

  public neighbors(node: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction === 'input') return this.inNeighbors(node);
    if (direction === 'output') return this.outNeighbors(node);
    return this.inner.neighbors(node);
  }

  public inNeighbors(node: NodeId): Iterable<NodeId> {
    return this.inner.outNeighbors(node);
  }

  public outNeighbors(node: NodeId): Iterable<NodeId> {
    return this.inner.inNeighbors(node);
  }

  public *edgeViews(): Iterable<EdgeView<E>> {
    if (!this._edges) return;
    for (const view of this.inner.edgeViews!()) yield flip(view as EdgeView<E>);
  }

  public *inEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this._edges) return;
    for (const view of this.inner.outEdges!(node)) yield flip(view as EdgeView<E>);
  }

  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this._edges) return;
    for (const view of this.inner.inEdges!(node)) yield flip(view as EdgeView<E>);
  }

  public inDegree(node: NodeId): number {
    if (this._degree) return this.inner.outDegree!(node);
    let count = 0;
    for (const _ of this.inner.outNeighbors(node)) count++;
    return count;
  }

  public outDegree(node: NodeId): number {
    if (this._degree) return this.inner.inDegree!(node);
    let count = 0;
    for (const _ of this.inner.inNeighbors(node)) count++;
    return count;
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

export function reversed<
  G extends Catalog &
    Neighbors &
    Partial<IntoEdges<unknown>> &
    Partial<IntoDegree> &
    Partial<NodeIndexable>,
>(graph: G): Reversed<G, EdgeOf<G>> {
  return new Reversed(graph);
}
