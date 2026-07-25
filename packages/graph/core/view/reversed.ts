import type {
  Direction,
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
 * 反向图视图：翻转所有边的方向，出边与入边互换。零成本，不复制数据。
 * @typeParam G 内层图
 * @typeParam E 边权重，从内层图推导
 */
export class Reversed<G extends Inner, E = EdgeOf<G>>
  extends Forwarding<G>
  implements Neighbors, IntoEdges<E>, IntoDegree, NodeIndexable
{
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
    if (!this.hasEdges) return;
    for (const view of this.inner.edgeViews!()) yield flip(view as EdgeView<E>);
  }

  /** 入边视图：取内层图的出边并翻转端点。 */
  public *inEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this.hasEdges) return;
    for (const view of this.inner.outEdges!(node))
      yield flip(view as EdgeView<E>);
  }

  /** 出边视图：取内层图的入边并翻转端点。 */
  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this.hasEdges) return;
    for (const view of this.inner.inEdges!(node))
      yield flip(view as EdgeView<E>);
  }

  /** 入度：取内层图的出度。 */
  public inDegree(node: NodeId): number {
    if (this.hasDegree) return this.inner.outDegree!(node);
    let count = 0;
    for (const _ of this.inner.outNeighbors(node)) count++;
    return count;
  }

  /** 出度：取内层图的入度。 */
  public outDegree(node: NodeId): number {
    if (this.hasDegree) return this.inner.inDegree!(node);
    let count = 0;
    for (const _ of this.inner.inNeighbors(node)) count++;
    return count;
  }
}

/** 创建反向图视图。 */
export function reversed<G extends Inner>(graph: G): Reversed<G, EdgeOf<G>> {
  return new Reversed(graph);
}
