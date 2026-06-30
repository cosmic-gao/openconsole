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
} from "../../types";
import type { Predicate } from "../predicate";

/**
 * 节点过滤视图：仅保留满足谓词的节点及其两端均保留的边。零成本，不复制数据。
 * @typeParam G 内层图
 * @typeParam E 边权重，从内层图推导
 */
export class NodeFilter<
  G extends Catalog &
    Neighbors &
    Partial<IntoEdges<unknown>> &
    Partial<IntoDegree>,
  E = EdgeOf<G>,
>
  implements Catalog, Neighbors, IntoEdges<E>
{
  /** 包裹内层图与节点保留谓词。 */
  public constructor(
    public readonly inner: G,
    public readonly predicate: Predicate<NodeId>,
  ) {}

  /** 遍历保留的节点。 */
  public nodes(): Iterable<NodeId> {
    const inner = this.inner;
    const predicate = this.predicate;
    return {
      *[Symbol.iterator]() {
        for (const id of inner.nodes()) if (predicate(id)) yield id;
      },
    };
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

  /** 保留节点数。 */
  public get order(): number {
    let count = 0;
    for (const _ of this.nodes()) count++;
    return count;
  }

  /** 保留边数。 */
  public get size(): number {
    let count = 0;
    for (const _ of this.edges()) count++;
    return count;
  }

  /** 邻居节点，仅保留满足谓词者。 */
  public *neighbors(node: NodeId, direction?: Direction): Iterable<NodeId> {
    if (!this.predicate(node)) return;
    for (const n of this.inner.neighbors(node, direction))
      if (this.predicate(n)) yield n;
  }

  /** 入边邻居，仅保留满足谓词者。 */
  public *inNeighbors(node: NodeId): Iterable<NodeId> {
    if (!this.predicate(node)) return;
    for (const n of this.inner.inNeighbors(node))
      if (this.predicate(n)) yield n;
  }

  /** 出边邻居，仅保留满足谓词者。 */
  public *outNeighbors(node: NodeId): Iterable<NodeId> {
    if (!this.predicate(node)) return;
    for (const n of this.inner.outNeighbors(node))
      if (this.predicate(n)) yield n;
  }

  /** 遍历两端均保留的边视图。 */
  public *edgeViews(): Iterable<EdgeView<E>> {
    if (typeof this.inner.edgeViews !== "function") return;
    for (const view of this.inner.edgeViews()) {
      if (this.predicate(view.source) && this.predicate(view.target))
        yield view as EdgeView<E>;
    }
  }

  /** 入边视图，仅保留源节点满足谓词者。 */
  public *inEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this.predicate(node) || typeof this.inner.inEdges !== "function")
      return;
    for (const view of this.inner.inEdges(node)) {
      if (this.predicate(view.source)) yield view as EdgeView<E>;
    }
  }

  /** 出边视图，仅保留目标节点满足谓词者。 */
  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    if (!this.predicate(node) || typeof this.inner.outEdges !== "function")
      return;
    for (const view of this.inner.outEdges(node)) {
      if (this.predicate(view.target)) yield view as EdgeView<E>;
    }
  }
}
