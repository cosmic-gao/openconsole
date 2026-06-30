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
} from "../types";
import {
  EMPTY,
  flip,
  hasDegree,
  hasEdges,
  hasIndex,
  nodeAt,
  nodeIndex,
} from "./shared";

/**
 * 反向图视图：翻转所有边的方向，出边与入边互换。零成本，不复制数据。
 * @typeParam G 内层图
 * @typeParam E 边权重，从内层图推导
 */
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

  /** 包裹内层图，构造反向视图。 */
  public constructor(public readonly inner: G) {
    this._edges = hasEdges(inner);
    this._degree = hasDegree(inner);
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

  /** 邻居节点；方向相对内层图已翻转。 */
  public neighbors(node: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction === "input") return this.inNeighbors(node);
    if (direction === "output") return this.outNeighbors(node);
    return this.inner.neighbors(node);
  }

  /** 入边邻居：取内层图的出边邻居。 */
  public inNeighbors(node: NodeId): Iterable<NodeId> {
    return this.inner.outNeighbors(node);
  }

  /** 出边邻居：取内层图的入边邻居。 */
  public outNeighbors(node: NodeId): Iterable<NodeId> {
    return this.inner.inNeighbors(node);
  }

  /** 遍历所有边视图，端点已翻转。 */
  public *edgeViews(): Iterable<EdgeView<E>> {
    if (!this._edges) return;
    for (const view of this.inner.edgeViews!()) yield flip(view as EdgeView<E>);
  }

  /** 入边视图：取内层图的出边并翻转端点。 */
  public *inEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this._edges) return;
    for (const view of this.inner.outEdges!(node))
      yield flip(view as EdgeView<E>);
  }

  /** 出边视图：取内层图的入边并翻转端点。 */
  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this._edges) return;
    for (const view of this.inner.inEdges!(node))
      yield flip(view as EdgeView<E>);
  }

  /** 入度：取内层图的出度。 */
  public inDegree(node: NodeId): number {
    if (this._degree) return this.inner.outDegree!(node);
    let count = 0;
    for (const _ of this.inner.outNeighbors(node)) count++;
    return count;
  }

  /** 出度：取内层图的入度。 */
  public outDegree(node: NodeId): number {
    if (this._degree) return this.inner.inDegree!(node);
    let count = 0;
    for (const _ of this.inner.inNeighbors(node)) count++;
    return count;
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

/** 创建反向图视图。 */
export function reversed<
  G extends Catalog &
    Neighbors &
    Partial<IntoEdges<unknown>> &
    Partial<IntoDegree> &
    Partial<NodeIndexable>,
>(graph: G): Reversed<G, EdgeOf<G>> {
  return new Reversed(graph);
}
