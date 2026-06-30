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
} from "../types";
import { EMPTY, flip, hasEdges, hasIndex, nodeAt, nodeIndex } from "./shared";

/**
 * 无向化视图：合并出边与入边，使图表现为无向图，供连通分量、MST、桥等算法复用。零成本，不复制数据。
 * @typeParam G 内层图
 * @typeParam E 边权重，从内层图推导
 */
export class Undirected<
  G extends Catalog &
    Neighbors &
    Partial<IntoEdges<unknown>> &
    Partial<NodeIndexable>,
  E = EdgeOf<G>,
>
  implements Catalog, Neighbors, IntoEdges<E>, IntoDegree, NodeIndexable
{
  private readonly _edges: boolean;
  private readonly _index: boolean;

  /** 包裹内层图，构造无向化视图。 */
  public constructor(public readonly inner: G) {
    this._edges = hasEdges(inner);
    this._index = hasIndex(inner);
  }

  /** 节点数，与内层图一致。 */
  public get order(): number {
    return this.inner.order;
  }

  /** 边数，与内层图一致。 */
  public get size(): number {
    return this._edges ? this.inner.size : 0;
  }

  /** 遍历所有节点。 */
  public nodes(): Iterable<NodeId> {
    return this.inner.nodes();
  }

  /** 遍历所有边。 */
  public edges(): Iterable<EdgeId> {
    return this._edges ? this.inner.edges() : EMPTY;
  }

  /** 邻居节点：合并出边与入边邻居。 */
  public *neighbors(node: NodeId): Iterable<NodeId> {
    yield* this.inner.outNeighbors(node);
    yield* this.inner.inNeighbors(node);
  }

  /** 入边邻居：等同于全部邻居。 */
  public inNeighbors(node: NodeId): Iterable<NodeId> {
    return this.neighbors(node);
  }

  /** 出边邻居：等同于全部邻居。 */
  public outNeighbors(node: NodeId): Iterable<NodeId> {
    return this.neighbors(node);
  }

  /** 入度：等同于无向度数。 */
  public inDegree(node: NodeId): number {
    return this._degree(node);
  }

  /** 出度：等同于无向度数。 */
  public outDegree(node: NodeId): number {
    return this._degree(node);
  }

  private _degree(node: NodeId): number {
    let count = 0;
    for (const _ of this.neighbors(node)) count++;
    return count;
  }

  /** 遍历所有边视图。 */
  public *edgeViews(): Iterable<EdgeView<E>> {
    if (!this._edges) return;
    for (const view of this.inner.edgeViews!()) yield view as EdgeView<E>;
  }

  /** 入边视图：等同于出边视图。 */
  public inEdges(node: NodeId): Iterable<EdgeView<E>> {
    return this.outEdges(node);
  }

  /** 出边视图：合并内层出边与翻转后的入边。 */
  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this._edges) return;
    for (const view of this.inner.outEdges!(node)) yield view as EdgeView<E>;
    for (const view of this.inner.inEdges!(node))
      yield flip(view as EdgeView<E>);
  }

  /** 节点索引上界。 */
  public bound(): number {
    return this._index ? this.inner.bound!() : this.inner.order;
  }

  /** 按索引取节点。 */
  public at(index: number): NodeId | undefined {
    return this._index ? this.inner.at!(index) : nodeAt(this.inner, index);
  }

  /** 取节点的索引。 */
  public indexOf(node: NodeId): number {
    return this._index
      ? this.inner.indexOf!(node)
      : nodeIndex(this.inner, node);
  }
}

/** 创建无向化视图。 */
export function undirected<
  G extends Catalog &
    Neighbors &
    Partial<IntoEdges<unknown>> &
    Partial<NodeIndexable>,
>(graph: G): Undirected<G, EdgeOf<G>> {
  return new Undirected(graph);
}
