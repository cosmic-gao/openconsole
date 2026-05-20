/**
 * EdgeFilter：按边谓词过滤的零成本视图。
 */

import type {
  Direction,
  EdgeId,
  EdgeView,
  Catalog,
  IntoEdges,
  Neighbors,
  NodeId,
} from '../../types';
import type { Predicate } from '../predicate';

/**
 * 边过滤视图：节点不变，仅过滤边。
 *
 * @remarks 必须依赖 {@link IntoEdges}，因为只有边视图才能高效地按谓词过滤。
 *
 * @template E 边权重类型
 * @template G 至少满足 {@link Catalog} + {@link IntoEdges} 的图类型
 */
export class EdgeFilter<
  E,
  G extends Catalog & Neighbors & IntoEdges<E>,
>
implements Catalog, Neighbors, IntoEdges<E> {
  /**
   * @param inner 原始图
   * @param predicate 边保留谓词
   */
  public constructor(
    public readonly inner: G,
    public readonly predicate: Predicate<EdgeView<E>>,
  ) {}

  /** {@inheritDoc Catalog.nodeIds} */
  public get nodeIds(): Iterable<NodeId> {
    return this.inner.nodeIds;
  }

  /** {@inheritDoc Catalog.edgeIds} */
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
    return this.inner.nodeCount();
  }

  /** {@inheritDoc Catalog.edgeCount} */
  public edgeCount(): number {
    let n = 0;
    for (const _ of this.getEdges()) n++;
    return n;
  }

  /** 邻居：跳过被隐去的边；`direction` 缺省时返回 in + out。 */
  public *neighbors(nodeId: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction !== 'input') yield* this.downstream(nodeId);
    if (direction !== 'output') yield* this.upstream(nodeId);
  }

  /** 入邻居：根据保留的入边推导。 */
  public *upstream(nodeId: NodeId): Iterable<NodeId> {
    for (const view of this.inner.getIncoming(nodeId)) {
      if (this.predicate(view)) yield view.source;
    }
  }

  /** 出邻居：根据保留的出边推导。 */
  public *downstream(nodeId: NodeId): Iterable<NodeId> {
    for (const view of this.inner.getOutgoing(nodeId)) {
      if (this.predicate(view)) yield view.target;
    }
  }

  /** {@inheritDoc IntoEdges.getEdges} */
  public *getEdges(): Iterable<EdgeView<E>> {
    for (const view of this.inner.getEdges()) if (this.predicate(view)) yield view;
  }

  /** {@inheritDoc IntoEdges.getIncoming} */
  public *getIncoming(nodeId: NodeId): Iterable<EdgeView<E>> {
    for (const view of this.inner.getIncoming(nodeId)) if (this.predicate(view)) yield view;
  }

  /** {@inheritDoc IntoEdges.getOutgoing} */
  public *getOutgoing(nodeId: NodeId): Iterable<EdgeView<E>> {
    for (const view of this.inner.getOutgoing(nodeId)) if (this.predicate(view)) yield view;
  }
}

