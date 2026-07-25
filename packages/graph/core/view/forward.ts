import { EMPTY, hasDegree, hasEdges, hasIndex } from "../support";
import type {
  Catalog,
  EdgeId,
  IntoDegree,
  IntoEdges,
  Neighbors,
  NodeId,
  NodeIndexable,
} from "../types";
import { nodeAt, nodeIndex } from "./shared";

/** 视图能包裹的内层图：邻接必备，其余 trait 可选（构造时嗅探）。 */
export type Inner = Catalog &
  Neighbors &
  Partial<IntoEdges<unknown>> &
  Partial<IntoDegree> &
  Partial<NodeIndexable>;

/**
 * 视图的转发骨架：节点集合与下标寻址原样透给内层图，子类只覆写真正改变语义的
 * 邻接与边视图。内层能力在构造时探测一次并缓存。
 */
export abstract class Forwarding<G extends Inner>
  implements Catalog, NodeIndexable
{
  protected readonly hasEdges: boolean;
  protected readonly hasDegree: boolean;
  protected readonly hasIndex: boolean;

  public constructor(public readonly inner: G) {
    this.hasEdges = hasEdges(inner);
    this.hasDegree = hasDegree(inner);
    this.hasIndex = hasIndex(inner);
  }

  public get order(): number {
    return this.inner.order;
  }

  /** 内层无边视图时为 0。 */
  public get size(): number {
    return this.hasEdges ? this.inner.size : 0;
  }

  public nodes(): Iterable<NodeId> {
    return this.inner.nodes();
  }

  public edges(): Iterable<EdgeId> {
    return this.hasEdges ? this.inner.edges() : EMPTY;
  }

  /** 内层不可索引时退化为节点数。 */
  public bound(): number {
    return this.hasIndex ? this.inner.bound!() : this.inner.order;
  }

  /** 内层不可索引时线性定位。 */
  public at(index: number): NodeId | undefined {
    return this.hasIndex ? this.inner.at!(index) : nodeAt(this.inner, index);
  }

  /** 内层不可索引时线性查找。 */
  public indexOf(node: NodeId): number {
    return this.hasIndex
      ? this.inner.indexOf!(node)
      : nodeIndex(this.inner, node);
  }
}
