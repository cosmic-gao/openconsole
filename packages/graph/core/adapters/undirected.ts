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

const EMPTY: Iterable<never> = {
  *[Symbol.iterator]() {},
};

interface Capabilities {
  readonly edges: boolean;
  readonly indexable: boolean;
}

export class Undirected<
    G extends Catalog & Neighbors & Partial<IntoEdges<unknown>> & Partial<NodeIndexable>,
    E = EdgeOf<G>,
  >
  implements Catalog, Neighbors, IntoEdges<E>, IntoDegree, NodeIndexable
{
  private readonly _capabilities: Capabilities;

  public constructor(public readonly inner: G) {
    this._capabilities = {
      edges: typeof inner.edgeViews === 'function',
      indexable:
        typeof inner.bound === 'function' &&
        typeof inner.at === 'function' &&
        typeof inner.indexOf === 'function',
    };
  }

  public get order(): number {
    return this.inner.order;
  }

  public get size(): number {
    return this._capabilities.edges ? this.inner.size : 0;
  }

  public nodes(): Iterable<NodeId> {
    return this.inner.nodes();
  }

  public edges(): Iterable<EdgeId> {
    return this._capabilities.edges ? this.inner.edges() : EMPTY;
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
    if (!this._capabilities.edges) return;
    for (const view of this.inner.edgeViews!()) yield view as EdgeView<E>;
  }

  public inEdges(node: NodeId): Iterable<EdgeView<E>> {
    return this.outEdges(node);
  }

  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this._capabilities.edges) return;
    for (const view of this.inner.outEdges!(node)) yield view as EdgeView<E>;
    for (const view of this.inner.inEdges!(node)) yield flip(view as EdgeView<E>);
  }

  public bound(): number {
    return this._capabilities.indexable ? this.inner.bound!() : this.inner.order;
  }

  public at(index: number): NodeId | undefined {
    if (this._capabilities.indexable) return this.inner.at!(index);
    let i = 0;
    for (const id of this.inner.nodes()) {
      if (i === index) return id;
      i++;
    }
    return undefined;
  }

  public indexOf(node: NodeId): number {
    if (this._capabilities.indexable) return this.inner.indexOf!(node);
    let i = 0;
    for (const id of this.inner.nodes()) {
      if (id === node) return i;
      i++;
    }
    return -1;
  }
}

export function undirected<
  G extends Catalog & Neighbors & Partial<IntoEdges<unknown>> & Partial<NodeIndexable>,
>(graph: G): Undirected<G, EdgeOf<G>> {
  return new Undirected(graph);
}

function flip<E>(view: EdgeView<E>): EdgeView<E> {
  return { id: view.id, source: view.target, target: view.source, weight: view.weight };
}
