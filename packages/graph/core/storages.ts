/**
 * 多种图存储 (storage) 实现
 *
 * @remarks
 * 借鉴 petgraph "多种图实现并存" 的设计：
 * - {@link Graph}（在 {@link ./classic}）：端口 / Socket 强类型，节点编辑器场景；
 * - {@link MapGraph}：基于 `Map<NodeId, ...>` 的轻量稀疏图，无端口，纯拓扑算法用；
 * - {@link MatrixGraph}：基于位图 / 邻接矩阵的稠密图，O(1) 邻接查询。
 *
 * 三者都实现同一组访问者 trait（{@link Catalog}、{@link Neighbors}、{@link IntoEdgeRefs}、
 * {@link IntoDegree}、{@link Visitable}、{@link NodeIndexable}），因此可以被同一份算法消费。
 */

import type {
  Direction,
  EdgeId,
  EdgeRef,
  Catalog,
  GraphId,
  IntoDegree,
  IntoEdgeRefs,
  Neighbors,
  NodeId,
  NodeIndexable,
  Visitable,
} from './types';

/** {@link MapGraph} 内部边记录。 */
interface MapEdgeRecord<E> {
  readonly id: EdgeId;
  readonly source: NodeId;
  readonly target: NodeId;
  weight: E | undefined;
}

/**
 * 基于 `Map` 的稀疏图：节点直接以 ID 为键，无端口 / Socket 概念。
 *
 * @remarks
 * - 适合纯拓扑场景：依赖图、调度图、状态机；
 * - 节点 / 边 ID 由调用方提供，自动分配 fallback 时使用 `e0`、`e1`...；
 * - 节点删除会同步删除所有相关边，时间复杂度 O(deg(v))。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export class MapGraph<N = unknown, E = unknown>
implements
    Catalog,
    Neighbors,
    IntoEdgeRefs<E>,
    IntoDegree,
    Visitable,
    NodeIndexable {
  /** 节点 ID → 节点权重。 */
  public readonly nodes = new Map<NodeId, N | undefined>();

  /** 边 ID → 边记录。 */
  public readonly edges = new Map<EdgeId, MapEdgeRecord<E>>();

  /** 节点 → 出边 ID 列表。 */
  private readonly _out = new Map<NodeId, EdgeId[]>();

  /** 节点 → 入边 ID 列表。 */
  private readonly _in = new Map<NodeId, EdgeId[]>();

  /** 自动 ID 计数器。 */
  private _autoId = 0;

  /**
   * @param id 图唯一标识
   */
  public constructor(public readonly id: GraphId) {}

  /**
   * 从边对数组快速构造 {@link MapGraph}。
   *
   * @template N 节点权重类型
   * @template E 边权重类型
   * @param id 图 ID
   * @param edges `[source, target, weight?]` 形式的边列表；缺失的节点会被自动 `addNode`
   *
   * @example
   * ```ts
   * const g = MapGraph.from('demo' as GraphId, [
   *   ['a' as NodeId, 'b' as NodeId, 1],
   *   ['b' as NodeId, 'c' as NodeId, 2],
   * ]);
   * ```
   */
  public static from<N = unknown, E = unknown>(
    id: GraphId,
    edges: ReadonlyArray<[NodeId, NodeId] | [NodeId, NodeId, E]>,
  ): MapGraph<N, E> {
    const graph = new MapGraph<N, E>(id);
    for (const entry of edges) {
      const [source, target] = entry;
      if (!graph.hasNode(source)) graph.addNode(source);
      if (!graph.hasNode(target)) graph.addNode(target);
      const weight = entry.length === 3 ? entry[2] : undefined;
      graph.addEdge(source, target, weight);
    }
    return graph;
  }

  /**
   * 加入或覆盖一个节点的权重。
   *
   * @param nodeId 节点 ID
   * @param weight 节点权重
   * @returns 当前图实例（链式调用）
   */
  public addNode(nodeId: NodeId, weight?: N): this {
    if (!this.nodes.has(nodeId)) {
      this._out.set(nodeId, []);
      this._in.set(nodeId, []);
    }
    this.nodes.set(nodeId, weight);
    return this;
  }

  /**
   * 移除节点及其所有相关边。
   *
   * @param nodeId 节点 ID
   * @returns 是否成功移除
   */
  public removeNode(nodeId: NodeId): boolean {
    if (!this.nodes.has(nodeId)) return false;
    const incident = new Set<EdgeId>();
    for (const id of this._out.get(nodeId) ?? []) incident.add(id);
    for (const id of this._in.get(nodeId) ?? []) incident.add(id);
    for (const edgeId of incident) this.removeEdge(edgeId);
    this._out.delete(nodeId);
    this._in.delete(nodeId);
    this.nodes.delete(nodeId);
    return true;
  }

  /**
   * 加入一条有向边。
   *
   * @param source 起点节点 ID
   * @param target 终点节点 ID
   * @param weight 边权重
   * @param edgeId 边 ID；省略时按 `e${自增}` 自动生成
   * @returns 实际使用的边 ID
   * @throws {Error} 起点 / 终点节点不存在或边 ID 已被占用时抛出
   */
  public addEdge(
    source: NodeId,
    target: NodeId,
    weight?: E,
    edgeId?: EdgeId,
  ): EdgeId {
    if (!this.nodes.has(source)) {
      throw new Error(`[MapGraph "${String(this.id)}"] addEdge: source "${String(source)}" not found.`);
    }
    if (!this.nodes.has(target)) {
      throw new Error(`[MapGraph "${String(this.id)}"] addEdge: target "${String(target)}" not found.`);
    }
    const id = edgeId ?? (`e${this._autoId++}` as EdgeId);
    if (this.edges.has(id)) {
      throw new Error(`[MapGraph "${String(this.id)}"] addEdge: edge "${String(id)}" already exists.`);
    }
    this.edges.set(id, { id, source, target, weight });
    this._out.get(source)!.push(id);
    this._in.get(target)!.push(id);
    return id;
  }

  /**
   * 移除一条边。
   *
   * @param edgeId 边 ID
   * @returns 是否成功移除
   */
  public removeEdge(edgeId: EdgeId): boolean {
    const edge = this.edges.get(edgeId);
    if (!edge) return false;
    detach(this._out.get(edge.source), edgeId);
    detach(this._in.get(edge.target), edgeId);
    this.edges.delete(edgeId);
    return true;
  }

  /** 是否存在指定 ID 的节点。 */
  public hasNode(nodeId: NodeId): boolean {
    return this.nodes.has(nodeId);
  }

  /** 是否存在指定 ID 的边。 */
  public hasEdge(edgeId: EdgeId): boolean {
    return this.edges.has(edgeId);
  }

  /**
   * 指定方向上是否邻接（沿出边方向 source → target）。
   *
   * @remarks
   * 复杂度 **O(deg(source))**：邻接表型图的天然代价（与 petgraph 的 `Graph::contains_edge` 一致）。
   * 如果业务需要 O(1) 邻接判定，请使用 {@link MatrixGraph}；在 `MapGraph` 上额外维护
   * `Set<NodeId>` 索引会与多重边语义冲突，且要求所有写入路径双倍同步，得不偿失。
   *
   * @param source 起点节点 ID
   * @param target 终点节点 ID
   */
  public adjacent(source: NodeId, target: NodeId): boolean {
    const edges = this._out.get(source);
    if (!edges) return false;
    for (const id of edges) {
      if (this.edges.get(id)?.target === target) return true;
    }
    return false;
  }

  /** 清空所有节点与边。 */
  public clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this._out.clear();
    this._in.clear();
    this._autoId = 0;
  }

  /** {@inheritdoc Catalog.nodeIds} */
  public readonly nodeIds: Iterable<NodeId> = {
    [Symbol.iterator]: () => this.nodes.keys(),
  };

  /** {@inheritdoc Catalog.edgeIds} */
  public readonly edgeIds: Iterable<EdgeId> = {
    [Symbol.iterator]: () => this.edges.keys(),
  };

  /** {@inheritdoc Catalog.nodeCount} */
  public nodeCount(): number {
    return this.nodes.size;
  }

  /** {@inheritdoc Catalog.edgeCount} */
  public edgeCount(): number {
    return this.edges.size;
  }

  /** {@inheritdoc Neighbors.neighbors} */
  public *neighbors(nodeId: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction !== 'input') {
      for (const id of this._out.get(nodeId) ?? []) {
        const edge = this.edges.get(id);
        if (edge) yield edge.target;
      }
    }
    if (direction !== 'output') {
      for (const id of this._in.get(nodeId) ?? []) {
        const edge = this.edges.get(id);
        if (edge) yield edge.source;
      }
    }
  }

  /** {@inheritdoc Neighbors.incomingNeighbors} */
  public *incomingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    for (const id of this._in.get(nodeId) ?? []) {
      const edge = this.edges.get(id);
      if (edge) yield edge.source;
    }
  }

  /** {@inheritdoc Neighbors.outgoingNeighbors} */
  public *outgoingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    for (const id of this._out.get(nodeId) ?? []) {
      const edge = this.edges.get(id);
      if (edge) yield edge.target;
    }
  }

  /** {@inheritdoc IntoEdgeRefs.edgeRefs} */
  public *edgeRefs(): Iterable<EdgeRef<E>> {
    for (const edge of this.edges.values()) yield edge;
  }

  /** {@inheritdoc IntoEdgeRefs.incomingEdgeRefs} */
  public *incomingEdgeRefs(nodeId: NodeId): Iterable<EdgeRef<E>> {
    for (const id of this._in.get(nodeId) ?? []) {
      const edge = this.edges.get(id);
      if (edge) yield edge;
    }
  }

  /** {@inheritdoc IntoEdgeRefs.outgoingEdgeRefs} */
  public *outgoingEdgeRefs(nodeId: NodeId): Iterable<EdgeRef<E>> {
    for (const id of this._out.get(nodeId) ?? []) {
      const edge = this.edges.get(id);
      if (edge) yield edge;
    }
  }

  /** {@inheritdoc IntoDegree.inDegree} */
  public inDegree(nodeId: NodeId): number {
    return this._in.get(nodeId)?.length ?? 0;
  }

  /** {@inheritdoc IntoDegree.outDegree} */
  public outDegree(nodeId: NodeId): number {
    return this._out.get(nodeId)?.length ?? 0;
  }

  /** {@inheritdoc Visitable.marks} */
  public marks(): Map<NodeId, boolean> {
    const map = new Map<NodeId, boolean>();
    for (const id of this.nodes.keys()) map.set(id, false);
    return map;
  }

  /** {@inheritdoc Visitable.reset} */
  public reset(map: Map<NodeId, boolean>): void {
    for (const key of map.keys()) map.set(key, false);
  }

  /** {@inheritdoc NodeIndexable.bound} */
  public bound(): number {
    return this.nodes.size;
  }

  /** {@inheritdoc NodeIndexable.at} */
  public at(index: number): NodeId | undefined {
    if (index < 0 || index >= this.nodes.size) return undefined;
    let i = 0;
    for (const id of this.nodes.keys()) {
      if (i === index) return id;
      i++;
    }
    return undefined;
  }

  /** {@inheritdoc NodeIndexable.indexOf} */
  public indexOf(nodeId: NodeId): number {
    if (!this.nodes.has(nodeId)) return -1;
    let i = 0;
    for (const id of this.nodes.keys()) {
      if (id === nodeId) return i;
      i++;
    }
    return -1;
  }
}

/** {@link MatrixGraph} 内部边记录。 */
interface MatrixEdgeRecord<E> {
  readonly id: EdgeId;
  readonly sourceIndex: number;
  readonly targetIndex: number;
  weight: E | undefined;
}

/**
 * 基于邻接矩阵的稠密图：`adjacent(i, j)` O(1)，节点删除会留下空位但保持索引稳定。
 *
 * @remarks
 * - 矩阵以一维 `Int32Array` 存储边 ID（`-1` 表示无边），相比对象数组节省内存且 cache-friendly；
 * - 支持节点删除（"墓碑"位置），新节点插入优先复用墓碑槽位；
 * - 适合 `|E| ≈ |V|^2` 场景或需要快速判断邻接的应用。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export class MatrixGraph<N = unknown, E = unknown>
implements
    Catalog,
    Neighbors,
    IntoEdgeRefs<E>,
    IntoDegree,
    Visitable,
    NodeIndexable {
  /** 节点 ID → 矩阵索引。 */
  private readonly _nodeToIndex = new Map<NodeId, number>();

  /** 矩阵索引 → 节点 ID（已删除的位置保存 `null`）。 */
  private readonly _indexToNode: Array<NodeId | null> = [];

  /** 节点权重数组（与 `_indexToNode` 同步索引）。 */
  private readonly _nodeWeights: Array<N | undefined> = [];

  /** 边 ID → 边记录。 */
  public readonly edges = new Map<EdgeId, MatrixEdgeRecord<E>>();

  /** 邻接矩阵（一维存储），`-1` 表示无边，否则为 `EdgeId` 在 `_edgeIdPool` 中的索引。 */
  private _matrix: Int32Array;

  /** 边 ID 池，与矩阵元素相互索引；与 `edges` 内容一一对应（已释放槽位等待复用）。 */
  private readonly _edgeIdPool: EdgeId[] = [];

  /** `_edgeIdPool` 已释放的槽位栈（`removeEdge` 释放，`addEdge` 优先复用），避免 pool 单调膨胀。 */
  private readonly _freeEdgeSlots: number[] = [];

  /** `_indexToNode` 已释放的墓碑槽位栈（`removeNode` 释放，`addNode` 优先复用），O(1) 复用替代 `indexOf(null)`。 */
  private readonly _freeNodeSlots: number[] = [];

  /** 当前矩阵容量（行 / 列数）。 */
  private _capacity: number;

  /** 当前实际节点数（不含墓碑）。 */
  private _nodeCount = 0;

  /** 自动边 ID 计数。 */
  private _autoEdgeId = 0;

  /**
   * @param id 图 ID
   * @param initialCapacity 矩阵初始容量；不够时会自动 2× 扩容
   */
  public constructor(public readonly id: GraphId, initialCapacity = 8) {
    this._capacity = Math.max(1, initialCapacity);
    this._matrix = new Int32Array(this._capacity * this._capacity).fill(-1);
  }

  /**
   * 从节点列表 + 边对快速构造 {@link MatrixGraph}。
   *
   * @template N 节点权重类型
   * @template E 边权重类型
   * @param id 图 ID
   * @param nodes 节点 ID 数组（顺序决定矩阵索引）
   * @param edges `[source, target, weight?]` 形式的边列表
   *
   * @example
   * ```ts
   * const g = MatrixGraph.from('mx' as GraphId, [
   *   'a' as NodeId, 'b' as NodeId, 'c' as NodeId,
   * ], [
   *   ['a' as NodeId, 'b' as NodeId],
   *   ['b' as NodeId, 'c' as NodeId],
   * ]);
   * ```
   */
  public static from<N = unknown, E = unknown>(
    id: GraphId,
    nodes: ReadonlyArray<NodeId>,
    edges: ReadonlyArray<[NodeId, NodeId] | [NodeId, NodeId, E]>,
  ): MatrixGraph<N, E> {
    const graph = new MatrixGraph<N, E>(id, Math.max(8, nodes.length));
    for (const node of nodes) graph.addNode(node);
    for (const entry of edges) {
      const [source, target] = entry;
      const weight = entry.length === 3 ? entry[2] : undefined;
      graph.addEdge(source, target, weight);
    }
    return graph;
  }

  /**
   * 加入节点。
   *
   * @param nodeId 节点 ID
   * @param weight 节点权重
   * @returns 当前图实例（链式调用）
   * @throws {Error} 同 ID 节点已存在时抛出
   */
  public addNode(nodeId: NodeId, weight?: N): this {
    if (this._nodeToIndex.has(nodeId)) {
      throw new Error(
        `[MatrixGraph "${String(this.id)}"] addNode: node "${String(nodeId)}" already exists.`,
      );
    }
    let index: number;
    if (this._freeNodeSlots.length > 0) {
      // O(1) 复用墓碑槽。`removeNode` 已经把该索引行/列上的边清零，可以直接写入。
      index = this._freeNodeSlots.pop()!;
      this._indexToNode[index] = nodeId;
      this._nodeWeights[index] = weight;
    } else {
      index = this._indexToNode.length;
      if (index >= this._capacity) this._grow();
      this._indexToNode.push(nodeId);
      this._nodeWeights.push(weight);
    }
    this._nodeToIndex.set(nodeId, index);
    this._nodeCount++;
    return this;
  }

  /**
   * 移除节点（标记为墓碑位）及与其相关的所有边。
   *
   * @param nodeId 节点 ID
   * @returns 是否成功移除
   */
  public removeNode(nodeId: NodeId): boolean {
    const index = this._nodeToIndex.get(nodeId);
    if (index === undefined) return false;

    // 清扫该行 + 该列上的边。
    for (let j = 0; j < this._indexToNode.length; j++) {
      const out = this._matrix[index * this._capacity + j]!;
      if (out !== -1) this.removeEdge(this._edgeIdPool[out]!);
      const inn = this._matrix[j * this._capacity + index]!;
      if (inn !== -1) this.removeEdge(this._edgeIdPool[inn]!);
    }

    this._indexToNode[index] = null;
    this._nodeWeights[index] = undefined;
    this._nodeToIndex.delete(nodeId);
    this._freeNodeSlots.push(index);
    this._nodeCount--;
    return true;
  }

  /**
   * 加入一条有向边。
   *
   * @param source 起点节点 ID
   * @param target 终点节点 ID
   * @param weight 边权重
   * @param edgeId 边 ID；省略时按 `e${自增}` 自动生成
   * @returns 实际使用的边 ID
   * @throws {Error} 起点 / 终点节点不存在或同 (source, target) 已存在边时抛出
   */
  public addEdge(
    source: NodeId,
    target: NodeId,
    weight?: E,
    edgeId?: EdgeId,
  ): EdgeId {
    const sourceIndex = this._nodeToIndex.get(source);
    const targetIndex = this._nodeToIndex.get(target);
    if (sourceIndex === undefined) {
      throw new Error(
        `[MatrixGraph "${String(this.id)}"] addEdge: source "${String(source)}" not found.`,
      );
    }
    if (targetIndex === undefined) {
      throw new Error(
        `[MatrixGraph "${String(this.id)}"] addEdge: target "${String(target)}" not found.`,
      );
    }
    const slot = sourceIndex * this._capacity + targetIndex;
    if (this._matrix[slot]! !== -1) {
      throw new Error(
        `[MatrixGraph "${String(this.id)}"] addEdge: edge already exists from "${String(source)}" to "${String(target)}".`,
      );
    }
    const id = edgeId ?? (`e${this._autoEdgeId++}` as EdgeId);
    if (this.edges.has(id)) {
      throw new Error(
        `[MatrixGraph "${String(this.id)}"] addEdge: edge "${String(id)}" already exists.`,
      );
    }
    let poolIndex: number;
    if (this._freeEdgeSlots.length > 0) {
      poolIndex = this._freeEdgeSlots.pop()!;
      this._edgeIdPool[poolIndex] = id;
    } else {
      poolIndex = this._edgeIdPool.length;
      this._edgeIdPool.push(id);
    }
    this._matrix[slot] = poolIndex;
    this.edges.set(id, { id, sourceIndex, targetIndex, weight });
    return id;
  }

  /**
   * 移除一条边。
   *
   * @param edgeId 边 ID
   * @returns 是否成功移除
   */
  public removeEdge(edgeId: EdgeId): boolean {
    const edge = this.edges.get(edgeId);
    if (!edge) return false;
    const slot = edge.sourceIndex * this._capacity + edge.targetIndex;
    const poolIndex = this._matrix[slot]!;
    this._matrix[slot] = -1;
    if (poolIndex !== -1) this._freeEdgeSlots.push(poolIndex);
    this.edges.delete(edgeId);
    return true;
  }

  /** O(1) 判断邻接。 */
  public adjacent(source: NodeId, target: NodeId): boolean {
    const sourceIndex = this._nodeToIndex.get(source);
    const targetIndex = this._nodeToIndex.get(target);
    if (sourceIndex === undefined || targetIndex === undefined) return false;
    return this._matrix[sourceIndex * this._capacity + targetIndex]! !== -1;
  }

  /** 是否存在指定 ID 的节点。 */
  public hasNode(nodeId: NodeId): boolean {
    return this._nodeToIndex.has(nodeId);
  }

  /** 是否存在指定 ID 的边。 */
  public hasEdge(edgeId: EdgeId): boolean {
    return this.edges.has(edgeId);
  }

  /** {@inheritdoc Catalog.nodeIds} */
  public readonly nodeIds: Iterable<NodeId> = {
    [Symbol.iterator]: () => this._nodeIdIterator(),
  };

  /** {@inheritdoc Catalog.edgeIds} */
  public readonly edgeIds: Iterable<EdgeId> = {
    [Symbol.iterator]: () => this.edges.keys(),
  };

  /** {@inheritdoc Catalog.nodeCount} */
  public nodeCount(): number {
    return this._nodeCount;
  }

  /** {@inheritdoc Catalog.edgeCount} */
  public edgeCount(): number {
    return this.edges.size;
  }

  /** {@inheritdoc Neighbors.neighbors} */
  public *neighbors(nodeId: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction !== 'input') yield* this.outgoingNeighbors(nodeId);
    if (direction !== 'output') yield* this.incomingNeighbors(nodeId);
  }

  /** {@inheritdoc Neighbors.incomingNeighbors} */
  public *incomingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    const targetIndex = this._nodeToIndex.get(nodeId);
    if (targetIndex === undefined) return;
    for (let i = 0; i < this._indexToNode.length; i++) {
      if (this._matrix[i * this._capacity + targetIndex]! === -1) continue;
      const id = this._indexToNode[i];
      if (id !== null) yield id;
    }
  }

  /** {@inheritdoc Neighbors.outgoingNeighbors} */
  public *outgoingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    const sourceIndex = this._nodeToIndex.get(nodeId);
    if (sourceIndex === undefined) return;
    const base = sourceIndex * this._capacity;
    for (let j = 0; j < this._indexToNode.length; j++) {
      if (this._matrix[base + j]! === -1) continue;
      const id = this._indexToNode[j];
      if (id !== null) yield id;
    }
  }

  /** {@inheritdoc IntoEdgeRefs.edgeRefs} */
  public *edgeRefs(): Iterable<EdgeRef<E>> {
    for (const edge of this.edges.values()) {
      const source = this._indexToNode[edge.sourceIndex];
      const target = this._indexToNode[edge.targetIndex];
      if (source !== null && target !== null && source !== undefined && target !== undefined) {
        yield { id: edge.id, source, target, weight: edge.weight };
      }
    }
  }

  /** {@inheritdoc IntoEdgeRefs.incomingEdgeRefs} */
  public *incomingEdgeRefs(nodeId: NodeId): Iterable<EdgeRef<E>> {
    const targetIndex = this._nodeToIndex.get(nodeId);
    if (targetIndex === undefined) return;
    for (let i = 0; i < this._indexToNode.length; i++) {
      const slot = this._matrix[i * this._capacity + targetIndex]!;
      if (slot === -1) continue;
      const edgeId = this._edgeIdPool[slot]!;
      const edge = this.edges.get(edgeId);
      if (!edge) continue;
      const source = this._indexToNode[i];
      if (source === null || source === undefined) continue;
      yield { id: edge.id, source, target: nodeId, weight: edge.weight };
    }
  }

  /** {@inheritdoc IntoEdgeRefs.outgoingEdgeRefs} */
  public *outgoingEdgeRefs(nodeId: NodeId): Iterable<EdgeRef<E>> {
    const sourceIndex = this._nodeToIndex.get(nodeId);
    if (sourceIndex === undefined) return;
    const base = sourceIndex * this._capacity;
    for (let j = 0; j < this._indexToNode.length; j++) {
      const slot = this._matrix[base + j]!;
      if (slot === -1) continue;
      const edgeId = this._edgeIdPool[slot]!;
      const edge = this.edges.get(edgeId);
      if (!edge) continue;
      const target = this._indexToNode[j];
      if (target === null || target === undefined) continue;
      yield { id: edge.id, source: nodeId, target, weight: edge.weight };
    }
  }

  /** {@inheritdoc IntoDegree.inDegree} */
  public inDegree(nodeId: NodeId): number {
    const targetIndex = this._nodeToIndex.get(nodeId);
    if (targetIndex === undefined) return 0;
    let count = 0;
    for (let i = 0; i < this._indexToNode.length; i++) {
      if (this._matrix[i * this._capacity + targetIndex]! !== -1) count++;
    }
    return count;
  }

  /** {@inheritdoc IntoDegree.outDegree} */
  public outDegree(nodeId: NodeId): number {
    const sourceIndex = this._nodeToIndex.get(nodeId);
    if (sourceIndex === undefined) return 0;
    let count = 0;
    const base = sourceIndex * this._capacity;
    for (let j = 0; j < this._indexToNode.length; j++) {
      if (this._matrix[base + j]! !== -1) count++;
    }
    return count;
  }

  /** {@inheritdoc Visitable.marks} */
  public marks(): Map<NodeId, boolean> {
    const map = new Map<NodeId, boolean>();
    for (const id of this.nodeIds) map.set(id, false);
    return map;
  }

  /** {@inheritdoc Visitable.reset} */
  public reset(map: Map<NodeId, boolean>): void {
    for (const key of map.keys()) map.set(key, false);
  }

  /**
   * {@inheritdoc NodeIndexable.bound}
   *
   * @remarks
   * 等于内部槽位数组长度，**可能大于** {@link nodeCount}：删除节点会留下墓碑槽，
   * 在被新 `addNode` 复用之前 `bound() > nodeCount()`。算法应迭代 `[0, bound())`
   * 并跳过 {@link at} 返回 `undefined` 的位置。
   */
  public bound(): number {
    return this._indexToNode.length;
  }

  /** {@inheritdoc NodeIndexable.at} */
  public at(index: number): NodeId | undefined {
    return this._indexToNode[index] ?? undefined;
  }

  /** {@inheritdoc NodeIndexable.indexOf} */
  public indexOf(nodeId: NodeId): number {
    return this._nodeToIndex.get(nodeId) ?? -1;
  }

  /**
   * 矩阵 2× 扩容，搬迁旧值到新行布局。
   *
   * @internal
   */
  private _grow(): void {
    const next = this._capacity * 2;
    const grown = new Int32Array(next * next).fill(-1);
    for (let i = 0; i < this._capacity; i++) {
      for (let j = 0; j < this._capacity; j++) {
        grown[i * next + j] = this._matrix[i * this._capacity + j]!;
      }
    }
    this._matrix = grown;
    this._capacity = next;
  }

  /**
   * 跳过墓碑位的节点 ID 迭代器。
   *
   * @internal
   */
  private *_nodeIdIterator(): IterableIterator<NodeId> {
    for (const id of this._indexToNode) {
      if (id !== null) yield id;
    }
  }
}

/**
 * 从数组中删除首个等于 `value` 的元素（原地修改）。
 *
 * @internal
 */
function detach<T>(arr: T[] | undefined, value: T): boolean {
  if (!arr) return false;
  const index = arr.indexOf(value);
  if (index === -1) return false;
  arr.splice(index, 1);
  return true;
}
