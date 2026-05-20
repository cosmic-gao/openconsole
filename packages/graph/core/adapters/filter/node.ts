/**
 * NodeFilter：按节点谓词过滤的零成本视图。
 */

import type {
  Direction,
  EdgeId,
  EdgeOf,
  EdgeView,
  Catalog,
  IntoDegree,
  IntoEdges,
  Neighbors,
  NodeId,
} from '../../types';
import type { Predicate } from '../predicate';

/**
 * 节点过滤视图：仅暴露满足谓词的节点及与之相连的边。
 *
 * @remarks
 * - 被隐去的节点不会出现在 `nodeIds` 中；
 * - 邻居 / 边视图迭代时也会跳过被隐去的节点；
 * - 用于子图分析（如带某些标签的节点）而无需复制图。
 *
 * @template G 内层图类型
 * @template E 边权重类型（从 `G` 自动推导）
 */
export class NodeFilter<
  G extends Catalog &
    Neighbors &
    Partial<IntoEdges<unknown>> &
    Partial<IntoDegree>,
  E = EdgeOf<G>,
>
implements Catalog, Neighbors, IntoEdges<E> {
  /**
   * @param inner 原始图
   * @param predicate 节点保留谓词
   */
  public constructor(
    public readonly inner: G,
    public readonly predicate: Predicate<NodeId>,
  ) {}

  /** {@inheritDoc Catalog.nodeIds} */
  public get nodeIds(): Iterable<NodeId> {
    const inner = this.inner;
    const predicate = this.predicate;
    return {
      *[Symbol.iterator]() {
        for (const id of inner.nodeIds) if (predicate(id)) yield id;
      },
    };
  }

  /**
   * {@inheritDoc Catalog.edgeIds}
   *
   * @remarks
   * 直接复用本类的 {@link getEdges}（已按节点谓词过滤过两端）。
   * 当 inner 未实现 `getEdges` 时 {@link getEdges} 自身返回空，因此 `edgeIds`
   * 同样为空，不会泄漏未过滤的 `inner.edgeIds`。需要边过滤的视图请使用实现了
   * {@link IntoEdges} 的图（{@link Graph} 已实现）。
   */
  public get edgeIds(): Iterable<EdgeId> {
    const getEdges = this.getEdges.bind(this);
    return {
      *[Symbol.iterator]() {
        for (const view of getEdges()) yield view.id;
      },
    };
  }

  /** {@inheritDoc Catalog.nodeCount} */
  public nodeCount(): number {
    let n = 0;
    for (const _ of this.nodeIds) n++;
    return n;
  }

  /** {@inheritDoc Catalog.edgeCount} */
  public edgeCount(): number {
    let n = 0;
    for (const _ of this.edgeIds) n++;
    return n;
  }

  /** 邻居（剔除被隐去的节点）；`direction` 透传到 inner。 */
  public *neighbors(nodeId: NodeId, direction?: Direction): Iterable<NodeId> {
    if (!this.predicate(nodeId)) return;
    for (const n of this.inner.neighbors(nodeId, direction)) if (this.predicate(n)) yield n;
  }

  /** 入邻居（剔除被隐去的节点）。 */
  public *incomingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    if (!this.predicate(nodeId)) return;
    for (const n of this.inner.incomingNeighbors(nodeId)) if (this.predicate(n)) yield n;
  }

  /** 出邻居（剔除被隐去的节点）。 */
  public *outgoingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    if (!this.predicate(nodeId)) return;
    for (const n of this.inner.outgoingNeighbors(nodeId)) if (this.predicate(n)) yield n;
  }

  /** 全图边视图（两端都需保留）。 */
  public *getEdges(): Iterable<EdgeView<E>> {
    if (typeof this.inner.getEdges !== 'function') return;
    for (const view of this.inner.getEdges()) {
      if (this.predicate(view.source) && this.predicate(view.target)) yield view as EdgeView<E>;
    }
  }

  /** 入边视图（来源端需保留）。 */
  public *getIncoming(nodeId: NodeId): Iterable<EdgeView<E>> {
    if (!this.predicate(nodeId) || typeof this.inner.getIncoming !== 'function') return;
    for (const view of this.inner.getIncoming(nodeId)) {
      if (this.predicate(view.source)) yield view as EdgeView<E>;
    }
  }

  /** 出边视图（终点端需保留）。 */
  public *getOutgoing(nodeId: NodeId): Iterable<EdgeView<E>> {
    if (!this.predicate(nodeId) || typeof this.inner.getOutgoing !== 'function') return;
    for (const view of this.inner.getOutgoing(nodeId)) {
      if (this.predicate(view.target)) yield view as EdgeView<E>;
    }
  }
}

