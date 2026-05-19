/**
 * NodeFiltered / EdgeFiltered：按谓词过滤的零成本视图。
 */

import type {
  Direction,
  EdgeId,
  EdgeView,
  Catalog,
  IntoDegree,
  IntoEdgeViews,
  Neighbors,
  NodeId,
} from '../types';
import type { Predicate } from './predicate';

/**
 * 由图类型 `G` 推导边权重类型 `E`；G 不实现 IntoEdgeViews 时退化为 `unknown`。
 */
type EdgeOf<G> = G extends IntoEdgeViews<infer E> ? E : unknown;

/**
 * 节点过滤视图：仅暴露满足谓词的节点及与之相连的边。
 *
 * @remarks
 * - 被隐去的节点不会出现在 `nodeIds` 中；
 * - 邻居 / 边引用迭代时也会跳过被隐去的节点；
 * - 用于子图分析（如某些标签的节点）而无需复制图。
 *
 * @template G 内层图类型
 * @template E 边权重类型（从 G 自动推导）
 */
export class NodeFiltered<
  G extends Catalog &
    Neighbors &
    Partial<IntoEdgeViews<unknown>> &
    Partial<IntoDegree>,
  E = EdgeOf<G>,
>
implements Catalog, Neighbors, IntoEdgeViews<E> {
  /**
   * @param inner 原始图
   * @param predicate 节点保留谓词
   */
  public constructor(
    public readonly inner: G,
    public readonly predicate: Predicate<NodeId>,
  ) {}

  /** {@inheritdoc Catalog.nodeIds} */
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
   * {@inheritdoc Catalog.edgeIds}
   *
   * @remarks
   * 直接复用本类的 {@link getEdges}（已按节点谓词过滤过两端）。
   * 当 inner 未实现 `getEdges` 时 {@link getEdges} 自身返回空，因此 `edgeIds` 同样为空，
   * 不会泄漏未过滤的 `inner.edgeIds`。需要边过滤的视图请使用实现了 {@link IntoEdgeViews} 的图
   * ({@link Graph} 已实现)。
   */
  public get edgeIds(): Iterable<EdgeId> {
    const getEdges = this.getEdges.bind(this);
    return {
      *[Symbol.iterator]() {
        for (const view of getEdges()) yield view.id;
      },
    };
  }

  /** {@inheritdoc Catalog.nodeCount} */
  public nodeCount(): number {
    let n = 0;
    for (const _ of this.nodeIds) n++;
    return n;
  }

  /** {@inheritdoc Catalog.edgeCount} */
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

  /** 全图边引用（两端都需保留）。 */
  public *getEdges(): Iterable<EdgeView<E>> {
    if (typeof this.inner.getEdges !== 'function') return;
    for (const view of this.inner.getEdges()) {
      if (this.predicate(view.source) && this.predicate(view.target)) yield view as EdgeView<E>;
    }
  }

  /** 入边（来源端需保留）。 */
  public *getIncomingEdges(nodeId: NodeId): Iterable<EdgeView<E>> {
    if (!this.predicate(nodeId) || typeof this.inner.getIncomingEdges !== 'function') return;
    for (const view of this.inner.getIncomingEdges(nodeId)) {
      if (this.predicate(view.source)) yield view as EdgeView<E>;
    }
  }

  /** 出边（终点端需保留）。 */
  public *getOutgoingEdges(nodeId: NodeId): Iterable<EdgeView<E>> {
    if (!this.predicate(nodeId) || typeof this.inner.getOutgoingEdges !== 'function') return;
    for (const view of this.inner.getOutgoingEdges(nodeId)) {
      if (this.predicate(view.target)) yield view as EdgeView<E>;
    }
  }
}

/**
 * 边过滤视图：节点不变，仅过滤边。
 *
 * @remarks 必须依赖 {@link IntoEdgeViews}，因为只有边引用才能高效地按谓词过滤。
 *
 * @template E 边权重类型
 * @template G 至少满足 {@link Catalog} + {@link IntoEdgeViews}<E> 的图类型
 */
export class EdgeFiltered<
  E,
  G extends Catalog & Neighbors & IntoEdgeViews<E>,
>
implements Catalog, Neighbors, IntoEdgeViews<E> {
  /**
   * @param inner 原始图
   * @param predicate 边保留谓词
   */
  public constructor(
    public readonly inner: G,
    public readonly predicate: Predicate<EdgeView<E>>,
  ) {}

  /** {@inheritdoc Catalog.nodeIds} */
  public get nodeIds(): Iterable<NodeId> {
    return this.inner.nodeIds;
  }

  /** {@inheritdoc Catalog.edgeIds} */
  public get edgeIds(): Iterable<EdgeId> {
    const getEdges = this.getEdges.bind(this);
    return {
      *[Symbol.iterator]() {
        for (const view of getEdges()) yield view.id;
      },
    };
  }

  /** {@inheritdoc Catalog.nodeCount} */
  public nodeCount(): number {
    return this.inner.nodeCount();
  }

  /** {@inheritdoc Catalog.edgeCount} */
  public edgeCount(): number {
    let n = 0;
    for (const _ of this.getEdges()) n++;
    return n;
  }

  /** 邻居：跳过被隐去的边；`direction` 缺省时返回 in + out。 */
  public *neighbors(nodeId: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction !== 'input') yield* this.outgoingNeighbors(nodeId);
    if (direction !== 'output') yield* this.incomingNeighbors(nodeId);
  }

  /** 入邻居：根据保留的入边推导。 */
  public *incomingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    for (const view of this.inner.getIncomingEdges(nodeId)) {
      if (this.predicate(view)) yield view.source;
    }
  }

  /** 出邻居：根据保留的出边推导。 */
  public *outgoingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    for (const view of this.inner.getOutgoingEdges(nodeId)) {
      if (this.predicate(view)) yield view.target;
    }
  }

  /** {@inheritdoc IntoEdgeViews.getEdges} */
  public *getEdges(): Iterable<EdgeView<E>> {
    for (const view of this.inner.getEdges()) if (this.predicate(view)) yield view;
  }

  /** {@inheritdoc IntoEdgeViews.getIncomingEdges} */
  public *getIncomingEdges(nodeId: NodeId): Iterable<EdgeView<E>> {
    for (const view of this.inner.getIncomingEdges(nodeId)) if (this.predicate(view)) yield view;
  }

  /** {@inheritdoc IntoEdgeViews.getOutgoingEdges} */
  public *getOutgoingEdges(nodeId: NodeId): Iterable<EdgeView<E>> {
    for (const view of this.inner.getOutgoingEdges(nodeId)) if (this.predicate(view)) yield view;
  }
}
