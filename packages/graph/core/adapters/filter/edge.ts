import type {
  Catalog,
  Direction,
  EdgeId,
  EdgeView,
  IntoEdges,
  Neighbors,
  NodeId,
} from "../../types";
import type { Predicate } from "../predicate";

/**
 * 边过滤视图：仅保留满足谓词的边，节点集保持不变。零成本，不复制数据。
 * @typeParam E 边权重
 * @typeParam G 内层图
 */
export class EdgeFilter<E, G extends Catalog & Neighbors & IntoEdges<E>>
  implements Catalog, Neighbors, IntoEdges<E>
{
  /** 包裹内层图与边保留谓词。 */
  public constructor(
    public readonly inner: G,
    public readonly predicate: Predicate<EdgeView<E>>,
  ) {}

  /** 遍历所有节点，与内层图一致。 */
  public nodes(): Iterable<NodeId> {
    return this.inner.nodes();
  }

  /** 遍历保留的边。 */
  public edges(): Iterable<EdgeId> {
    const edgeViews = this.edgeViews.bind(this);
    return {
      *[Symbol.iterator]() {
        for (const view of edgeViews()) yield view.id;
      },
    };
  }

  /** 节点数，与内层图一致。 */
  public get order(): number {
    return this.inner.order;
  }

  /** 保留边数。 */
  public get size(): number {
    let count = 0;
    for (const _ of this.edgeViews()) count++;
    return count;
  }

  /** 邻居节点，仅经由保留的边到达。 */
  public *neighbors(node: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction !== "input") yield* this.outNeighbors(node);
    if (direction !== "output") yield* this.inNeighbors(node);
  }

  /** 入边邻居，仅经由保留的边。 */
  public *inNeighbors(node: NodeId): Iterable<NodeId> {
    for (const view of this.inner.inEdges(node)) {
      if (this.predicate(view)) yield view.source;
    }
  }

  /** 出边邻居，仅经由保留的边。 */
  public *outNeighbors(node: NodeId): Iterable<NodeId> {
    for (const view of this.inner.outEdges(node)) {
      if (this.predicate(view)) yield view.target;
    }
  }

  /** 遍历保留的边视图。 */
  public *edgeViews(): Iterable<EdgeView<E>> {
    for (const view of this.inner.edgeViews())
      if (this.predicate(view)) yield view;
  }

  /** 入边视图，仅保留满足谓词者。 */
  public *inEdges(node: NodeId): Iterable<EdgeView<E>> {
    for (const view of this.inner.inEdges(node))
      if (this.predicate(view)) yield view;
  }

  /** 出边视图，仅保留满足谓词者。 */
  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    for (const view of this.inner.outEdges(node))
      if (this.predicate(view)) yield view;
  }
}
