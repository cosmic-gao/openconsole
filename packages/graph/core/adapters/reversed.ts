/**
 * Reversed：把所有边方向翻转后呈现给算法的零成本视图。
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
  NodeIndexable,
  Visitable,
} from '../types';

/** 空可迭代对象，O(1) 内存，用于 inner 缺 `getEdges` 时的安全回退。 */
const EMPTY: Iterable<never> = { *[Symbol.iterator]() { /* 空迭代器，无元素 */ } };

/** inner 的能力位，构造时一次性探测，避免每次调用都做反射检测。 */
interface Caps {
  readonly edges: boolean;
  readonly degree: boolean;
  readonly visitable: boolean;
  readonly indexable: boolean;
}

/**
 * 反向图视图：把所有边方向翻转后呈现给算法。
 *
 * @remarks
 * - 对 `outgoingNeighbors` 调用，返回内层的 `incomingNeighbors`，反之亦然；
 * - 同样翻转 `getIncoming` / `getOutgoing`，并交换每条边引用的 `source` / `target`；
 * - 入 / 出度互换；
 * - 不复制底层数据，包装本身是 O(1) 内存；
 * - **`E` 泛型从 inner 推导**：`reversed(g: IntoEdges<number>)` 得到 `Reversed<G, number>`；
 * - **edgeIds / edgeCount 一致性**：inner 缺 `getEdges` 时，edgeIds 返回空、edgeCount 为 0，与
 *   `getEdges` 的回退行为一致（不再透传 inner 的 edgeIds 造成方法间不一致）。
 *
 * 配合 {@link dfs} / {@link toposort} 等算法可以零成本地获得：
 * - 祖先遍历：`dfs(reversed(g), x)` 等价于反向 BFS / DFS；
 * - 反向拓扑序：`toposort(reversed(g))`；
 * - 强连通分量第二阶段：Kosaraju 算法直接复用 SCC 主算法。
 *
 * @template G 内层图类型（至少满足 {@link Catalog} + {@link Neighbors}）
 * @template E 边权重类型，从 G 自动推导
 */
export class Reversed<
  G extends Catalog &
    Neighbors &
    Partial<IntoEdges<unknown>> &
    Partial<IntoDegree> &
    Partial<Visitable> &
    Partial<NodeIndexable>,
  E = EdgeOf<G>,
>
implements
    Catalog,
    Neighbors,
    IntoEdges<E>,
    IntoDegree,
    Visitable,
    NodeIndexable {
  private readonly _caps: Caps;

  /**
   * @param inner 原始图
   */
  public constructor(public readonly inner: G) {
    this._caps = {
      edges: typeof inner.getEdges === 'function',
      degree:
        typeof inner.inDegree === 'function' && typeof inner.outDegree === 'function',
      visitable: typeof inner.marks === 'function' && typeof inner.reset === 'function',
      indexable:
        typeof inner.bound === 'function' &&
        typeof inner.at === 'function' &&
        typeof inner.indexOf === 'function',
    };
  }

  /** {@inheritDoc Catalog.nodeIds} */
  public get nodeIds(): Iterable<NodeId> {
    return this.inner.nodeIds;
  }

  /**
   * {@inheritDoc Catalog.edgeIds}
   *
   * @remarks
   * 反向只翻转端点，不改 ID，因此 inner 实现了 {@link IntoEdges} 时与原图等价；
   * 否则返回空可迭代，确保与 {@link getEdges} 的回退行为一致。
   */
  public get edgeIds(): Iterable<EdgeId> {
    return this._caps.edges ? this.inner.edgeIds : EMPTY;
  }

  /** {@inheritDoc Catalog.nodeCount} */
  public nodeCount(): number {
    return this.inner.nodeCount();
  }

  /**
   * {@inheritDoc Catalog.edgeCount}
   *
   * @remarks 与 {@link edgeIds} 同步：inner 缺 `getEdges` 时返回 0。
   */
  public edgeCount(): number {
    return this._caps.edges ? this.inner.edgeCount() : 0;
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

  /** 反向后的 `incomingNeighbors` = 原图的 `outgoingNeighbors`。 */
  public incomingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    return this.inner.outgoingNeighbors(nodeId);
  }

  /** 反向后的 `outgoingNeighbors` = 原图的 `incomingNeighbors`。 */
  public outgoingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    return this.inner.incomingNeighbors(nodeId);
  }

  /** 全图边视图（`source` / `target` 已互换）。 */
  public *getEdges(): Iterable<EdgeView<E>> {
    if (!this._caps.edges) return;
    for (const view of this.inner.getEdges!()) yield flip(view as EdgeView<E>);
  }

  /** 反向后的入边 = 原图的出边（已翻转 `source` / `target`）。 */
  public *getIncoming(nodeId: NodeId): Iterable<EdgeView<E>> {
    if (!this._caps.edges) return;
    for (const view of this.inner.getOutgoing!(nodeId)) yield flip(view as EdgeView<E>);
  }

  /** 反向后的出边 = 原图的入边（已翻转 `source` / `target`）。 */
  public *getOutgoing(nodeId: NodeId): Iterable<EdgeView<E>> {
    if (!this._caps.edges) return;
    for (const view of this.inner.getIncoming!(nodeId)) yield flip(view as EdgeView<E>);
  }

  /**
   * {@inheritDoc IntoDegree.inDegree}
   *
   * @remarks
   * 反向后的入度 = 原图的出度。inner 实现了 {@link IntoDegree} 时直接转发；
   * 否则枚举 `inner.outgoingNeighbors` 计数，与遍历语义一致。
   *
   * **性能注记**：fallback 路径下 `inDegree(v)` 与 {@link outDegree}(v) 各自做一次邻居枚举，
   *   若 caller 同时调用两者会重复枚举。需要双向度数时优先让 inner 实现 {@link IntoDegree}，
   *   或调用方自行缓存结果（如 {@link degrees}）。
   */
  public inDegree(nodeId: NodeId): number {
    if (this._caps.degree) return this.inner.outDegree!(nodeId);
    let count = 0;
    for (const _ of this.inner.outgoingNeighbors(nodeId)) count++;
    return count;
  }

  /**
   * {@inheritDoc IntoDegree.outDegree}
   *
   * @remarks 反向后的出度 = 原图的入度。fallback 性能注记同 {@link inDegree}。
   */
  public outDegree(nodeId: NodeId): number {
    if (this._caps.degree) return this.inner.inDegree!(nodeId);
    let count = 0;
    for (const _ of this.inner.incomingNeighbors(nodeId)) count++;
    return count;
  }

  /** {@inheritDoc Visitable.marks} */
  public marks(): Map<NodeId, boolean> {
    if (this._caps.visitable) return this.inner.marks!();
    const map = new Map<NodeId, boolean>();
    for (const id of this.nodeIds) map.set(id, false);
    return map;
  }

  /** {@inheritDoc Visitable.reset} */
  public reset(map: Map<NodeId, boolean>): void {
    if (this._caps.visitable) {
      this.inner.reset!(map);
      return;
    }
    for (const key of map.keys()) map.set(key, false);
  }

  /**
   * {@inheritDoc NodeIndexable.bound}
   *
   * @remarks
   * 当 inner 实现 {@link NodeIndexable} 时透传；否则回退为 `nodeCount()`（按稠密索引处理）。
   * 回退路径下调用方仍应在 `at(i) === undefined` 时跳过，以兼容未来稀疏 inner。
   */
  public bound(): number {
    return this._caps.indexable ? this.inner.bound!() : this.inner.nodeCount();
  }

  /** {@inheritDoc NodeIndexable.at} */
  public at(index: number): NodeId | undefined {
    if (this._caps.indexable) return this.inner.at!(index);
    let i = 0;
    for (const id of this.nodeIds) {
      if (i === index) return id;
      i++;
    }
    return undefined;
  }

  /** {@inheritDoc NodeIndexable.indexOf} */
  public indexOf(nodeId: NodeId): number {
    if (this._caps.indexable) return this.inner.indexOf!(nodeId);
    let i = 0;
    for (const id of this.nodeIds) {
      if (id === nodeId) return i;
      i++;
    }
    return -1;
  }
}

/**
 * 工厂函数：把任意图包装成反向视图。`E` 自动从 `G` 的 {@link IntoEdges} 推导。
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
    Partial<IntoEdges<unknown>> &
    Partial<IntoDegree> &
    Partial<Visitable> &
    Partial<NodeIndexable>,
>(graph: G): Reversed<G, EdgeOf<G>> {
  return new Reversed(graph);
}

/**
 * 翻转单条边视图的 `source` / `target`。
 *
 * @internal
 */
function flip<E>(view: EdgeView<E>): EdgeView<E> {
  return { id: view.id, source: view.target, target: view.source, weight: view.weight };
}
