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
 * 视图的转发骨架：节点集合与下标寻址原样透给内层图，边枚举按内层是否具备
 * {@link IntoEdges} 决定透传或返回空。子类只需覆写真正改变语义的邻接与边视图。
 *
 * 内层缺失的能力在构造时探测一次（{@link Forwarding.hasEdges} 等），
 * 之后走缓存标记，避免每次调用重复 `typeof` 判断。
 *
 * @typeParam G 内层图
 */
export abstract class Forwarding<G extends Inner>
  implements Catalog, NodeIndexable
{
  /** 内层是否具备边视图能力。 */
  protected readonly hasEdges: boolean;
  /** 内层是否具备度数查询能力。 */
  protected readonly hasDegree: boolean;
  /** 内层是否具备整数下标寻址能力。 */
  protected readonly hasIndex: boolean;

  /** 包裹内层图。 */
  public constructor(public readonly inner: G) {
    this.hasEdges = hasEdges(inner);
    this.hasDegree = hasDegree(inner);
    this.hasIndex = hasIndex(inner);
  }

  /** 节点数，与内层图一致。 */
  public get order(): number {
    return this.inner.order;
  }

  /** 边数，与内层图一致；内层无边视图时为 0。 */
  public get size(): number {
    return this.hasEdges ? this.inner.size : 0;
  }

  /** 遍历所有节点，与内层图一致。 */
  public nodes(): Iterable<NodeId> {
    return this.inner.nodes();
  }

  /** 遍历所有边；内层无边视图时为空。 */
  public edges(): Iterable<EdgeId> {
    return this.hasEdges ? this.inner.edges() : EMPTY;
  }

  /** 节点索引上界；内层不可索引时退化为节点数。 */
  public bound(): number {
    return this.hasIndex ? this.inner.bound!() : this.inner.order;
  }

  /** 按索引取节点；内层不可索引时线性定位。 */
  public at(index: number): NodeId | undefined {
    return this.hasIndex ? this.inner.at!(index) : nodeAt(this.inner, index);
  }

  /** 取节点的索引；内层不可索引时线性查找。 */
  public indexOf(node: NodeId): number {
    return this.hasIndex
      ? this.inner.indexOf!(node)
      : nodeIndex(this.inner, node);
  }
}
