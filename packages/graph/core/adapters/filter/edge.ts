import type {
  Catalog,
  Direction,
  EdgeId,
  EdgeView,
  IntoEdges,
  Neighbors,
  NodeId,
} from '../../types';
import type { Predicate } from '../predicate';

export class EdgeFilter<E, G extends Catalog & Neighbors & IntoEdges<E>>
  implements Catalog, Neighbors, IntoEdges<E>
{
  public constructor(
    public readonly inner: G,
    public readonly predicate: Predicate<EdgeView<E>>,
  ) {}

  public nodes(): Iterable<NodeId> {
    return this.inner.nodes();
  }

  public edges(): Iterable<EdgeId> {
    const edgeViews = this.edgeViews.bind(this);
    return {
      *[Symbol.iterator]() {
        for (const view of edgeViews()) yield view.id;
      },
    };
  }

  public get order(): number {
    return this.inner.order;
  }

  public get size(): number {
    let count = 0;
    for (const _ of this.edgeViews()) count++;
    return count;
  }

  public *neighbors(node: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction !== 'input') yield* this.outNeighbors(node);
    if (direction !== 'output') yield* this.inNeighbors(node);
  }

  public *inNeighbors(node: NodeId): Iterable<NodeId> {
    for (const view of this.inner.inEdges(node)) {
      if (this.predicate(view)) yield view.source;
    }
  }

  public *outNeighbors(node: NodeId): Iterable<NodeId> {
    for (const view of this.inner.outEdges(node)) {
      if (this.predicate(view)) yield view.target;
    }
  }

  public *edgeViews(): Iterable<EdgeView<E>> {
    for (const view of this.inner.edgeViews()) if (this.predicate(view)) yield view;
  }

  public *inEdges(node: NodeId): Iterable<EdgeView<E>> {
    for (const view of this.inner.inEdges(node)) if (this.predicate(view)) yield view;
  }

  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    for (const view of this.inner.outEdges(node)) if (this.predicate(view)) yield view;
  }
}
