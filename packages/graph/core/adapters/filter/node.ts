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
} from '../../types';
import type { Predicate } from '../predicate';

export class NodeFilter<
    G extends Catalog & Neighbors & Partial<IntoEdges<unknown>> & Partial<IntoDegree>,
    E = EdgeOf<G>,
  >
  implements Catalog, Neighbors, IntoEdges<E>
{
  public constructor(
    public readonly inner: G,
    public readonly predicate: Predicate<NodeId>,
  ) {}

  public nodes(): Iterable<NodeId> {
    const inner = this.inner;
    const predicate = this.predicate;
    return {
      *[Symbol.iterator]() {
        for (const id of inner.nodes()) if (predicate(id)) yield id;
      },
    };
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
    let count = 0;
    for (const _ of this.nodes()) count++;
    return count;
  }

  public get size(): number {
    let count = 0;
    for (const _ of this.edges()) count++;
    return count;
  }

  public *neighbors(node: NodeId, direction?: Direction): Iterable<NodeId> {
    if (!this.predicate(node)) return;
    for (const n of this.inner.neighbors(node, direction)) if (this.predicate(n)) yield n;
  }

  public *inNeighbors(node: NodeId): Iterable<NodeId> {
    if (!this.predicate(node)) return;
    for (const n of this.inner.inNeighbors(node)) if (this.predicate(n)) yield n;
  }

  public *outNeighbors(node: NodeId): Iterable<NodeId> {
    if (!this.predicate(node)) return;
    for (const n of this.inner.outNeighbors(node)) if (this.predicate(n)) yield n;
  }

  public *edgeViews(): Iterable<EdgeView<E>> {
    if (typeof this.inner.edgeViews !== 'function') return;
    for (const view of this.inner.edgeViews()) {
      if (this.predicate(view.source) && this.predicate(view.target)) yield view as EdgeView<E>;
    }
  }

  public *inEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this.predicate(node) || typeof this.inner.inEdges !== 'function') return;
    for (const view of this.inner.inEdges(node)) {
      if (this.predicate(view.source)) yield view as EdgeView<E>;
    }
  }

  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this.predicate(node) || typeof this.inner.outEdges !== 'function') return;
    for (const view of this.inner.outEdges(node)) {
      if (this.predicate(view.target)) yield view as EdgeView<E>;
    }
  }
}
