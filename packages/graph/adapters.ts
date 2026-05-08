/**
 * 图视图适配器（不复制底层数据的零成本包装）
 *
 * @remarks
 * 借鉴 petgraph 的 `Reversed` / `NodeFiltered` / `EdgeFiltered`：
 * - 适配器只做 trait 转发与方向 / 过滤翻译，不持有节点 / 边的副本；
 * - 任意实现 {@link IntoNeighbors} / {@link IntoEdgeRefs} 等 trait 的图都能被包装；
 * - 适配后的实例本身仍满足相同 trait，因此可层层嵌套（如 `Reversed(NodeFiltered(g, p))`）。
 */

import type {
  Direction,
  EdgeId,
  EdgeRef,
  GraphBase,
  IntoDegree,
  IntoEdgeRefs,
  IntoNeighbors,
  IntoNeighborsDirected,
  NodeId,
  NodeIndexable,
  Visitable,
} from './types';

// ============================================================
// Reversed - 反向边视图
// ============================================================

/**
 * 反向图视图：把所有边方向翻转后呈现给算法。
 *
 * @remarks
 * - 对 `outgoingNeighbors` 调用，返回内层的 `incomingNeighbors`，反之亦然；
 * - 同样翻转 `incomingEdgeRefs` / `outgoingEdgeRefs`，并交换每条边引用的 `source` / `target`；
 * - 入 / 出度互换；
 * - 不复制底层数据，包装本身是 O(1) 内存。
 *
 * 配合 {@link dfs} / {@link toposort} 等算法可以零成本地获得：
 * - 祖先遍历：`dfs(reversed(g), x)` 等价于反向 BFS / DFS；
 * - 反向拓扑序：`toposort(reversed(g))`；
 * - 强连通分量第二阶段：Kosaraju 算法直接复用 SCC 主算法。
 *
 * @template G 至少满足 {@link GraphBase} 的图类型
 */
export class Reversed<
  G extends GraphBase &
    IntoNeighbors &
    Partial<IntoNeighborsDirected> &
    Partial<IntoEdgeRefs<unknown>> &
    Partial<IntoDegree> &
    Partial<Visitable> &
    Partial<NodeIndexable>,
>
implements
    GraphBase,
    IntoNeighbors,
    IntoNeighborsDirected,
    IntoEdgeRefs<unknown>,
    IntoDegree,
    Visitable,
    NodeIndexable {
  /**
   * @param inner 原始图
   */
  public constructor(public readonly inner: G) {}

  // ---- GraphBase ----

  /** {@inheritdoc GraphBase.nodeIds} */
  public get nodeIds(): Iterable<NodeId> {
    return this.inner.nodeIds;
  }

  /** {@inheritdoc GraphBase.edgeIds} */
  public get edgeIds(): Iterable<EdgeId> {
    return this.inner.edgeIds;
  }

  /** {@inheritdoc GraphBase.nodeCount} */
  public nodeCount(): number {
    return this.inner.nodeCount();
  }

  /** {@inheritdoc GraphBase.edgeCount} */
  public edgeCount(): number {
    return this.inner.edgeCount();
  }

  // ---- IntoNeighbors（方向翻转） ----

  /** 全邻居在无向语义下与方向无关，直接转发。 */
  public neighbors(nodeId: NodeId): Iterable<NodeId> {
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

  /**
   * 按方向枚举反向图的邻居。
   *
   * @remarks
   * - `'input'`：反向图的入邻居 = 原图的出邻居 → `this.incomingNeighbors`（其内部已委托到 `inner.outgoingNeighbors`）；
   * - `'output'`：反向图的出邻居 = 原图的入邻居 → `this.outgoingNeighbors`。
   * 直接复用本类的方向化方法即可，无需再次手动翻转。
   */
  public neighborsDirected(nodeId: NodeId, direction: Direction): Iterable<NodeId> {
    return direction === 'input'
      ? this.incomingNeighbors(nodeId)
      : this.outgoingNeighbors(nodeId);
  }

  // ---- IntoEdgeRefs（source/target 互换） ----

  /** 全图边引用（source/target 已互换）。 */
  public *edgeRefs(): Iterable<EdgeRef<unknown>> {
    if (typeof this.inner.edgeRefs !== 'function') return;
    for (const ref of this.inner.edgeRefs()) yield flipEdgeRef(ref);
  }

  /** 反向后的入边 = 原图的出边（已翻转 source/target）。 */
  public *incomingEdgeRefs(nodeId: NodeId): Iterable<EdgeRef<unknown>> {
    if (typeof this.inner.outgoingEdgeRefs !== 'function') return;
    for (const ref of this.inner.outgoingEdgeRefs(nodeId)) yield flipEdgeRef(ref);
  }

  /** 反向后的出边 = 原图的入边（已翻转 source/target）。 */
  public *outgoingEdgeRefs(nodeId: NodeId): Iterable<EdgeRef<unknown>> {
    if (typeof this.inner.incomingEdgeRefs !== 'function') return;
    for (const ref of this.inner.incomingEdgeRefs(nodeId)) yield flipEdgeRef(ref);
  }

  // ---- IntoDegree（入出度互换） ----

  /** {@inheritdoc IntoDegree.inDegree} */
  public inDegree(nodeId: NodeId): number {
    return typeof this.inner.outDegree === 'function' ? this.inner.outDegree(nodeId) : 0;
  }

  /** {@inheritdoc IntoDegree.outDegree} */
  public outDegree(nodeId: NodeId): number {
    return typeof this.inner.inDegree === 'function' ? this.inner.inDegree(nodeId) : 0;
  }

  // ---- Visitable / NodeIndexable（透传） ----

  /** {@inheritdoc Visitable.visitMap} */
  public visitMap(): Map<NodeId, boolean> {
    if (typeof this.inner.visitMap === 'function') return this.inner.visitMap();
    const map = new Map<NodeId, boolean>();
    for (const id of this.nodeIds) map.set(id, false);
    return map;
  }

  /** {@inheritdoc Visitable.resetMap} */
  public resetMap(map: Map<NodeId, boolean>): void {
    if (typeof this.inner.resetMap === 'function') {
      this.inner.resetMap(map);
      return;
    }
    for (const key of map.keys()) map.set(key, false);
  }

  /** {@inheritdoc NodeIndexable.nodeBound} */
  public nodeBound(): number {
    if (typeof this.inner.nodeBound === 'function') return this.inner.nodeBound();
    return this.inner.nodeCount();
  }

  /** {@inheritdoc NodeIndexable.nodeIdAt} */
  public nodeIdAt(index: number): NodeId | undefined {
    if (typeof this.inner.nodeIdAt === 'function') return this.inner.nodeIdAt(index);
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
 * 工厂函数：把任意图包装成反向视图。
 *
 * @template G 输入图类型
 * @param graph 原始图
 *
 * @example
 * ```ts
 * import { reversed, dfs } from '@opendesign/graph';
 * for (const ancestor of dfs(reversed(g), node)) console.log(ancestor);
 * ```
 */
export function reversed<
  G extends GraphBase &
    IntoNeighbors &
    Partial<IntoNeighborsDirected> &
    Partial<IntoEdgeRefs<unknown>> &
    Partial<IntoDegree> &
    Partial<Visitable> &
    Partial<NodeIndexable>,
>(graph: G): Reversed<G> {
  return new Reversed(graph);
}

/**
 * 翻转单条边引用的 `source` / `target`。
 *
 * @internal
 */
function flipEdgeRef<E>(ref: EdgeRef<E>): EdgeRef<E> {
  return { id: ref.id, source: ref.target, target: ref.source, weight: ref.weight };
}

// ============================================================
// NodeFiltered - 节点过滤视图
// ============================================================

/**
 * 节点过滤器。
 *
 * @param nodeId 节点 ID
 * @returns `true` 表示保留，`false` 表示从视图中隐去
 */
export type NodePredicate = (nodeId: NodeId) => boolean;

/**
 * 节点过滤视图：仅暴露满足谓词的节点及与之相连的边。
 *
 * @remarks
 * - 被隐去的节点不会出现在 `nodeIds` 中；
 * - 邻居 / 边引用迭代时也会跳过被隐去的节点；
 * - 用于子图分析（如某些标签的节点）而无需复制图。
 *
 * @template G 至少满足 {@link GraphBase} + {@link IntoNeighbors} 的图类型
 */
export class NodeFiltered<
  G extends GraphBase &
    IntoNeighbors &
    Partial<IntoEdgeRefs<unknown>> &
    Partial<IntoDegree>,
>
implements GraphBase, IntoNeighbors, IntoEdgeRefs<unknown> {
  /**
   * @param inner 原始图
   * @param predicate 节点保留谓词
   */
  public constructor(
    public readonly inner: G,
    public readonly predicate: NodePredicate,
  ) {}

  /** {@inheritdoc GraphBase.nodeIds} */
  public get nodeIds(): Iterable<NodeId> {
    const inner = this.inner;
    const predicate = this.predicate;
    return {
      *[Symbol.iterator]() {
        for (const id of inner.nodeIds) if (predicate(id)) yield id;
      },
    };
  }

  /** {@inheritdoc GraphBase.edgeIds} */
  public get edgeIds(): Iterable<EdgeId> {
    if (typeof this.inner.edgeRefs !== 'function') return this.inner.edgeIds;
    const refs = this.inner.edgeRefs.bind(this.inner);
    const predicate = this.predicate;
    return {
      *[Symbol.iterator]() {
        for (const ref of refs()) {
          if (predicate(ref.source) && predicate(ref.target)) yield ref.id;
        }
      },
    };
  }

  /** {@inheritdoc GraphBase.nodeCount} */
  public nodeCount(): number {
    let n = 0;
    for (const _ of this.nodeIds) n++;
    return n;
  }

  /** {@inheritdoc GraphBase.edgeCount} */
  public edgeCount(): number {
    let n = 0;
    for (const _ of this.edgeIds) n++;
    return n;
  }

  /** 全邻居（剔除被隐去的节点）。 */
  public *neighbors(nodeId: NodeId): Iterable<NodeId> {
    if (!this.predicate(nodeId)) return;
    for (const n of this.inner.neighbors(nodeId)) if (this.predicate(n)) yield n;
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
  public *edgeRefs(): Iterable<EdgeRef<unknown>> {
    if (typeof this.inner.edgeRefs !== 'function') return;
    for (const ref of this.inner.edgeRefs()) {
      if (this.predicate(ref.source) && this.predicate(ref.target)) yield ref;
    }
  }

  /** 入边（来源端需保留）。 */
  public *incomingEdgeRefs(nodeId: NodeId): Iterable<EdgeRef<unknown>> {
    if (!this.predicate(nodeId) || typeof this.inner.incomingEdgeRefs !== 'function') return;
    for (const ref of this.inner.incomingEdgeRefs(nodeId)) {
      if (this.predicate(ref.source)) yield ref;
    }
  }

  /** 出边（终点端需保留）。 */
  public *outgoingEdgeRefs(nodeId: NodeId): Iterable<EdgeRef<unknown>> {
    if (!this.predicate(nodeId) || typeof this.inner.outgoingEdgeRefs !== 'function') return;
    for (const ref of this.inner.outgoingEdgeRefs(nodeId)) {
      if (this.predicate(ref.target)) yield ref;
    }
  }
}

/**
 * 工厂函数：包装为节点过滤视图。
 *
 * @template G 输入图类型
 * @param graph 原始图
 * @param predicate 节点保留谓词
 */
export function nodeFiltered<
  G extends GraphBase &
    IntoNeighbors &
    Partial<IntoEdgeRefs<unknown>> &
    Partial<IntoDegree>,
>(graph: G, predicate: NodePredicate): NodeFiltered<G> {
  return new NodeFiltered(graph, predicate);
}

// ============================================================
// EdgeFiltered - 边过滤视图
// ============================================================

/**
 * 边过滤器。
 *
 * @param edge 边引用
 * @returns `true` 表示保留，`false` 表示从视图中隐去
 */
export type EdgePredicate<E = unknown> = (edge: EdgeRef<E>) => boolean;

/**
 * 边过滤视图：节点不变，仅过滤边。
 *
 * @remarks 必须依赖 {@link IntoEdgeRefs}，因为只有边引用才能高效地按谓词过滤。
 *
 * @template E 边权重类型
 * @template G 至少满足 {@link GraphBase} + {@link IntoEdgeRefs}<E> 的图类型
 */
export class EdgeFiltered<
  E,
  G extends GraphBase & IntoNeighbors & IntoEdgeRefs<E>,
>
implements GraphBase, IntoNeighbors, IntoEdgeRefs<E> {
  /**
   * @param inner 原始图
   * @param predicate 边保留谓词
   */
  public constructor(
    public readonly inner: G,
    public readonly predicate: EdgePredicate<E>,
  ) {}

  /** {@inheritdoc GraphBase.nodeIds} */
  public get nodeIds(): Iterable<NodeId> {
    return this.inner.nodeIds;
  }

  /** {@inheritdoc GraphBase.edgeIds} */
  public get edgeIds(): Iterable<EdgeId> {
    const refs = this.inner.edgeRefs.bind(this.inner);
    const predicate = this.predicate;
    return {
      *[Symbol.iterator]() {
        for (const ref of refs()) if (predicate(ref)) yield ref.id;
      },
    };
  }

  /** {@inheritdoc GraphBase.nodeCount} */
  public nodeCount(): number {
    return this.inner.nodeCount();
  }

  /** {@inheritdoc GraphBase.edgeCount} */
  public edgeCount(): number {
    let n = 0;
    for (const _ of this.edgeRefs()) n++;
    return n;
  }

  /** 全邻居：跳过被隐去的边。 */
  public *neighbors(nodeId: NodeId): Iterable<NodeId> {
    yield* this.outgoingNeighbors(nodeId);
    yield* this.incomingNeighbors(nodeId);
  }

  /** 入邻居：根据保留的入边推导。 */
  public *incomingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    for (const ref of this.inner.incomingEdgeRefs(nodeId)) {
      if (this.predicate(ref)) yield ref.source;
    }
  }

  /** 出邻居：根据保留的出边推导。 */
  public *outgoingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    for (const ref of this.inner.outgoingEdgeRefs(nodeId)) {
      if (this.predicate(ref)) yield ref.target;
    }
  }

  /** {@inheritdoc IntoEdgeRefs.edgeRefs} */
  public *edgeRefs(): Iterable<EdgeRef<E>> {
    for (const ref of this.inner.edgeRefs()) if (this.predicate(ref)) yield ref;
  }

  /** {@inheritdoc IntoEdgeRefs.incomingEdgeRefs} */
  public *incomingEdgeRefs(nodeId: NodeId): Iterable<EdgeRef<E>> {
    for (const ref of this.inner.incomingEdgeRefs(nodeId)) if (this.predicate(ref)) yield ref;
  }

  /** {@inheritdoc IntoEdgeRefs.outgoingEdgeRefs} */
  public *outgoingEdgeRefs(nodeId: NodeId): Iterable<EdgeRef<E>> {
    for (const ref of this.inner.outgoingEdgeRefs(nodeId)) if (this.predicate(ref)) yield ref;
  }
}

/**
 * 工厂函数：包装为边过滤视图。
 *
 * @template E 边权重类型
 * @template G 输入图类型
 * @param graph 原始图
 * @param predicate 边保留谓词
 */
export function edgeFiltered<E, G extends GraphBase & IntoNeighbors & IntoEdgeRefs<E>>(
  graph: G,
  predicate: EdgePredicate<E>,
): EdgeFiltered<E, G> {
  return new EdgeFiltered<E, G>(graph, predicate);
}
