import { count } from "../support";
import type {
  EdgeOf,
  EdgeView,
  IntoDegree,
  IntoEdges,
  Neighbors,
  NodeId,
  NodeIndexable,
} from "../types";
import { Forwarding, type Inner } from "./forward";
import { flip } from "./shared";

/**
 * 无向化视图：合并出边与入边，使图表现为无向图，供连通分量、MST、桥等算法复用。零成本，不复制数据。
 * @typeParam G 内层图
 * @typeParam E 边权重，从内层图推导
 */
export class Undirected<G extends Inner, E = EdgeOf<G>>
  extends Forwarding<G>
  implements Neighbors, IntoEdges<E>, IntoDegree, NodeIndexable
{
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
    return this._total(node);
  }

  /** 出度：等同于无向度数。 */
  public outDegree(node: NodeId): number {
    return this._total(node);
  }

  /** 无向度数 = 内层出度 + 入度；内层具备 {@link IntoDegree} 时直通，否则遍历计数。 */
  private _total(node: NodeId): number {
    if (this.hasDegree) {
      return this.inner.outDegree!(node) + this.inner.inDegree!(node);
    }
    return count(this.neighbors(node));
  }

  /** 遍历所有边视图。 */
  public *edgeViews(): Iterable<EdgeView<E>> {
    if (!this.hasEdges) return;
    for (const view of this.inner.edgeViews!()) yield view as EdgeView<E>;
  }

  /** 入边视图：等同于出边视图。 */
  public inEdges(node: NodeId): Iterable<EdgeView<E>> {
    return this.outEdges(node);
  }

  /** 出边视图：合并内层出边与翻转后的入边。 */
  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this.hasEdges) return;
    for (const view of this.inner.outEdges!(node)) yield view as EdgeView<E>;
    for (const view of this.inner.inEdges!(node))
      yield flip(view as EdgeView<E>);
  }
}

/** 创建无向化视图。 */
export function undirected<G extends Inner>(
  graph: G,
): Undirected<G, EdgeOf<G>> {
  return new Undirected(graph);
}
