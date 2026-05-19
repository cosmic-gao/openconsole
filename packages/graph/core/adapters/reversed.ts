/**
 * Reversed：把所有边方向翻转后呈现给算法的零成本视图。
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
  NodeIndexable,
  Visitable,
} from '../types';

/**
 * 由图类型 `G` 推导边权重类型 `E`；G 不实现 IntoEdgeViews 时退化为 `unknown`。
 */
type EdgeOf<G> = G extends IntoEdgeViews<infer E> ? E : unknown;

/** 空可迭代对象，O(1) 内存，用于 inner 缺 getEdges 时的安全回退。 */
const EMPTY_ITERABLE: Iterable<never> = { *[Symbol.iterator]() { /* empty */ } };

/**
 * 反向图视图：把所有边方向翻转后呈现给算法。
 *
 * @remarks
 * - 对 `outgoingNeighbors` 调用，返回内层的 `incomingNeighbors`，反之亦然；
 * - 同样翻转 `getIncomingEdges` / `getOutgoingEdges`，并交换每条边引用的 `source` / `target`；
 * - 入 / 出度互换；
 * - 不复制底层数据，包装本身是 O(1) 内存；
 * - **`E` 泛型从 inner 推导**：`reversed(g: IntoEdgeViews<number>)` 得到 `Reversed<G, number>`；
 * - **edgeIds/edgeCount 一致性**：inner 缺 `getEdges` 时，edgeIds 返回空、edgeCount 为 0，与
 *   `getEdges` 的回退行为一致（不再透传 inner 的 edgeIds 造成方法间不一致）。
 *
 * 配合 {@link dfs} / {@link toposort} 等算法可以零成本地获得：
 * - 祖先遍历：`dfs(reversed(g), x)` 等价于反向 BFS / DFS；
 * - 反向拓扑序：`toposort(reversed(g))`；
 * - 强连通分量第二阶段：Kosaraju 算法直接复用 SCC 主算法。
 *
 * @template G 内层图类型（至少满足 Catalog + Neighbors）
 * @template E 边权重类型，从 G 自动推导
 */
export class Reversed<
  G extends Catalog &
    Neighbors &
    Partial<IntoEdgeViews<unknown>> &
    Partial<IntoDegree> &
    Partial<Visitable> &
    Partial<NodeIndexable>,
  E = EdgeOf<G>,
>
implements
    Catalog,
    Neighbors,
    IntoEdgeViews<E>,
    IntoDegree,
    Visitable,
    NodeIndexable {
  /**
   * @param inner 原始图
   */
  public constructor(public readonly inner: G) {}

  /** {@inheritdoc Catalog.nodeIds} */
  public get nodeIds(): Iterable<NodeId> {
    return this.inner.nodeIds;
  }

  /**
   * {@inheritdoc Catalog.edgeIds}
   *
   * @remarks
   * 若 inner 实现了 {@link IntoEdgeViews}，则边 ID 集合与原图等价（反向只翻转端点，不改 ID）；
   * 否则返回空可迭代，确保与 {@link getEdges} 的回退行为一致。
   */
  public get edgeIds(): Iterable<EdgeId> {
    return typeof this.inner.getEdges === 'function' ? this.inner.edgeIds : EMPTY_ITERABLE;
  }

  /** {@inheritdoc Catalog.nodeCount} */
  public nodeCount(): number {
    return this.inner.nodeCount();
  }

  /**
   * {@inheritdoc Catalog.edgeCount}
   *
   * @remarks 与 {@link edgeIds} 同步：inner 缺 getEdges 时返回 0。
   */
  public edgeCount(): number {
    return typeof this.inner.getEdges === 'function' ? this.inner.edgeCount() : 0;
  }

  /**
   * 反向图的邻居：缺省合并 in + out（无向语义不受翻转影响）；指定方向时复用本类
   * 已翻转的 {@link incomingNeighbors} / {@link outgoingNeighbors}。
   */
  public neighbors(nodeId: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction === 'input') return this.incomingNeighbors(nodeId);
    if (direction === 'output') return this.outgoingNeighbors(nodeId);
    return this.inner.neighbors(nodeId);
  }

  /** 反向后的 incomingNeighbors = 原图的 outgoingNeighbors。 */
  public incomingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    return this.inner.outgoingNeighbors(nodeId);
  }

  /** 反向后的 outgoingNeighbors = 原图的 incomingNeighbors。 */
  public outgoingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    return this.inner.incomingNeighbors(nodeId);
  }

  /** 全图边引用（source/target 已互换）。 */
  public *getEdges(): Iterable<EdgeView<E>> {
    if (typeof this.inner.getEdges !== 'function') return;
    for (const view of this.inner.getEdges()) yield flipEdgeView(view as EdgeView<E>);
  }

  /** 反向后的入边 = 原图的出边（已翻转 source/target）。 */
  public *getIncomingEdges(nodeId: NodeId): Iterable<EdgeView<E>> {
    if (typeof this.inner.getOutgoingEdges !== 'function') return;
    for (const view of this.inner.getOutgoingEdges(nodeId)) yield flipEdgeView(view as EdgeView<E>);
  }

  /** 反向后的出边 = 原图的入边（已翻转 source/target）。 */
  public *getOutgoingEdges(nodeId: NodeId): Iterable<EdgeView<E>> {
    if (typeof this.inner.getIncomingEdges !== 'function') return;
    for (const view of this.inner.getIncomingEdges(nodeId)) yield flipEdgeView(view as EdgeView<E>);
  }

  /**
   * {@inheritdoc IntoDegree.inDegree}
   *
   * @remarks
   * 反向后的入度 = 原图的出度。inner 实现了 {@link IntoDegree} 时直接转发；
   * 否则枚举 `inner.outgoingNeighbors` 计数，与遍历语义一致。
   */
  public inDegree(nodeId: NodeId): number {
    if (typeof this.inner.outDegree === 'function') return this.inner.outDegree(nodeId);
    let count = 0;
    for (const _ of this.inner.outgoingNeighbors(nodeId)) count++;
    return count;
  }

  /**
   * {@inheritdoc IntoDegree.outDegree}
   *
   * @remarks
   * 反向后的出度 = 原图的入度。inner 实现了 {@link IntoDegree} 时直接转发；
   * 否则枚举 `inner.incomingNeighbors` 计数。
   */
  public outDegree(nodeId: NodeId): number {
    if (typeof this.inner.inDegree === 'function') return this.inner.inDegree(nodeId);
    let count = 0;
    for (const _ of this.inner.incomingNeighbors(nodeId)) count++;
    return count;
  }

  /** {@inheritdoc Visitable.marks} */
  public marks(): Map<NodeId, boolean> {
    if (typeof this.inner.marks === 'function') return this.inner.marks();
    const map = new Map<NodeId, boolean>();
    for (const id of this.nodeIds) map.set(id, false);
    return map;
  }

  /** {@inheritdoc Visitable.reset} */
  public reset(map: Map<NodeId, boolean>): void {
    if (typeof this.inner.reset === 'function') {
      this.inner.reset(map);
      return;
    }
    for (const key of map.keys()) map.set(key, false);
  }

  /** {@inheritdoc NodeIndexable.bound} */
  public bound(): number {
    if (typeof this.inner.bound === 'function') return this.inner.bound();
    return this.inner.nodeCount();
  }

  /** {@inheritdoc NodeIndexable.at} */
  public at(index: number): NodeId | undefined {
    if (typeof this.inner.at === 'function') return this.inner.at(index);
    let i = 0;
    for (const id of this.nodeIds) {
      if (i === index) return id;
      i++;
    }
    return undefined;
  }

  /** {@inheritdoc NodeIndexable.indexOf} */
  public indexOf(nodeId: NodeId): number {
    if (typeof this.inner.indexOf === 'function') return this.inner.indexOf(nodeId);
    let i = 0;
    for (const id of this.nodeIds) {
      if (id === nodeId) return i;
      i++;
    }
    return -1;
  }
}

/**
 * 工厂函数：把任意图包装成反向视图。`E` 自动从 `G` 的 IntoEdgeViews 推导。
 *
 * @template G 输入图类型
 * @param graph 原始图
 *
 * @example
 * ```ts
 * import { reversed, dfs } from '@opendesign/graph';
 * // g: Graph<unknown, number> → reversed(g): Reversed<G, number>
 * for (const ancestor of dfs(reversed(g), node)) console.log(ancestor);
 * ```
 */
export function reversed<
  G extends Catalog &
    Neighbors &
    Partial<IntoEdgeViews<unknown>> &
    Partial<IntoDegree> &
    Partial<Visitable> &
    Partial<NodeIndexable>,
>(graph: G): Reversed<G, EdgeOf<G>> {
  return new Reversed(graph);
}

/**
 * 翻转单条边引用的 `source` / `target`。
 *
 * @internal
 */
function flipEdgeView<E>(view: EdgeView<E>): EdgeView<E> {
  return { id: view.id, source: view.target, target: view.source, weight: view.weight };
}
