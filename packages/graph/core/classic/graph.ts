/**
 * Graph：有向图主容器，承载节点与边并提供基础邻接查询。
 */

import type {
  Direction,
  EdgeId,
  EdgeView,
  GraphEventMap,
  GraphEventName,
  GraphId,
  GraphJson,
  GraphJsonEdge,
  GraphJsonNode,
  GraphListener,
  NodeId,
  PortDict,
  PortId,
  Sockets,
  Vertex,
  Subscribable,
} from '../types';
import { Edge } from './edge';
import { Endpoint } from './endpoint';
import type { Node } from './node';
import type { Port } from './port';

/**
 * 有向图，承载节点 (`Node`) 与边 (`Edge`)，并提供基础邻接查询。
 *
 * @remarks
 * 设计要点：
 * - **无中央缓存**：邻接关系直接由各端口自有的 {@link Port.edges} 列表派生，
 *   任何结构变更后查询立刻反映新状态，无失效钩子；
 * - **O(1) NodeIndexable**：内部维护 `_order` 数组 + `_index` Map，
 *   {@link at}/{@link indexOf}/{@link bound} 全部 O(1)；removeNode 使用 swap-and-pop，
 *   节点索引顺序在删除时**可能被打乱**；
 * - **变更事件**：通过 {@link on} 订阅节点/边的 add/remove，可用于增量算法（如
 *   `IncrementalTopo`）订阅。
 * - 拓扑排序、强连通分量等高阶算法不再挂在 Graph 上，请改用 {@link toposort} /
 *   {@link topology} / {@link scc} 等独立函数（仅依赖访问者 trait）。
 *
 * @template N 节点附带的数据载荷类型
 * @template E 边附带的数据载荷类型
 */
export class Graph<N = unknown, E = unknown> implements Subscribable<N, E> {
  /** 节点存储：NodeId → Node。 */
  public readonly nodes = new Map<NodeId, Vertex<N>>();

  /** 边存储：EdgeId → Edge。 */
  public readonly edges = new Map<EdgeId, Edge<E>>();

  /** index → NodeId；用 swap-and-pop 维护，O(1) `at(i)`。 */
  private readonly _order: NodeId[] = [];

  /** NodeId → index；O(1) `indexOf`。 */
  private readonly _index = new Map<NodeId, number>();

  /** 自增计数器，用于 {@link connect} 无 ID 时生成默认边 ID。 */
  private _sequence = 0;

  /** 事件订阅表。 */
  private readonly _listeners = new Map<GraphEventName, Set<GraphListener<unknown>>>();

  /**
   * @param id 图的唯一标识
   */
  public constructor(public readonly id: GraphId) {}

  /**
   * 节点所有出边的 ID 流。
   *
   * @internal
   */
  private *_outgoingEdgeIds(nodeId: NodeId): IterableIterator<EdgeId> {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    for (const key in node.outputs) {
      const port = node.outputs[key];
      if (!port) continue;
      for (const id of port.edges) yield id;
    }
  }

  /**
   * 节点所有入边的 ID 流。
   *
   * @internal
   */
  private *_incomingEdgeIds(nodeId: NodeId): IterableIterator<EdgeId> {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    for (const key in node.inputs) {
      const port = node.inputs[key];
      if (!port) continue;
      for (const id of port.edges) yield id;
    }
  }

  /**
   * 加入一个节点。
   *
   * @template I 节点的输入 Sockets 形态
   * @template O 节点的输出 Sockets 形态
   * @param node 待加入的节点
   * @returns 当前图实例（链式调用）
   * @throws {Error} 当同 ID 节点已存在时抛出
   */
  public addNode<I extends Sockets, O extends Sockets>(node: Node<I, O, N>): this {
    if (this.nodes.has(node.id)) {
      throw new Error(
        `[Graph "${String(this.id)}"] addNode: a node with id "${String(node.id)}" already exists.`,
      );
    }
    const vertex = node as unknown as Vertex<N>;
    this.nodes.set(node.id, vertex);
    this._index.set(node.id, this._order.length);
    this._order.push(node.id);
    this._emit('nodeAdded', { node: vertex });
    return this;
  }

  /**
   * 移除节点，并连带删除所有与该节点相关的边。
   *
   * @remarks 顺序：先发 `edgeRemoved`（每条 incident 边一次），再发 `nodeRemoved`。
   *
   * @param nodeId 节点 ID
   * @returns 被移除的节点；不存在时返回 `undefined`
   */
  public removeNode(nodeId: NodeId): Vertex<N> | undefined {
    const node = this.nodes.get(nodeId);
    if (!node) return undefined;

    const incident = new Set<EdgeId>();
    for (const id of this._outgoingEdgeIds(nodeId)) incident.add(id);
    for (const id of this._incomingEdgeIds(nodeId)) incident.add(id);
    for (const edgeId of incident) {
      const edge = this.edges.get(edgeId);
      if (!edge) continue;
      // 仅 detach 留存节点上的端口；被删节点上的端口会随节点一起 GC。
      if (edge.sourceId !== nodeId) edge.source.port.detach(edge.id);
      if (edge.targetId !== nodeId) edge.target.port.detach(edge.id);
      this.edges.delete(edgeId);
      this._emit('edgeRemoved', { edge });
    }

    // swap-and-pop 维护节点索引
    const idx = this._index.get(nodeId)!;
    const lastIdx = this._order.length - 1;
    if (idx !== lastIdx) {
      const lastId = this._order[lastIdx]!;
      this._order[idx] = lastId;
      this._index.set(lastId, idx);
    }
    this._order.pop();
    this._index.delete(nodeId);

    this.nodes.delete(nodeId);
    this._emit('nodeRemoved', { node });
    return node;
  }

  /**
   * 按 ID 获取节点。
   *
   * @param nodeId 节点 ID
   * @returns 节点实例；不存在时返回 `undefined`
   */
  public getNode(nodeId: NodeId): Vertex<N> | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * 是否存在指定 ID 的节点。
   *
   * @param nodeId 节点 ID
   */
  public hasNode(nodeId: NodeId): boolean {
    return this.nodes.has(nodeId);
  }

  /**
   * 按 ID 获取边。
   *
   * @param edgeId 边 ID
   * @returns 边实例；不存在时返回 `undefined`
   */
  public getEdge(edgeId: EdgeId): Edge<E> | undefined {
    return this.edges.get(edgeId);
  }

  /**
   * 是否存在指定 ID 的边。
   *
   * @param edgeId 边 ID
   */
  public hasEdge(edgeId: EdgeId): boolean {
    return this.edges.has(edgeId);
  }

  /**
   * 查找从 `source` 直接指向 `target` 的第一条边。
   *
   * @remarks 存在多重边时只返回首条；如需全部请用 {@link edgesBetween}。
   *
   * @param source 起点节点 ID
   * @param target 终点节点 ID
   * @returns 边实例；不存在时返回 `undefined`
   */
  public findEdge(source: NodeId, target: NodeId): Edge<E> | undefined {
    for (const id of this._outgoingEdgeIds(source)) {
      const edge = this.edges.get(id);
      if (edge && edge.targetId === target) return edge;
    }
    return undefined;
  }

  /**
   * 取边的两端节点 ID。
   *
   * @param edgeId 边 ID
   * @returns `[sourceId, targetId]`；边不存在时返回 `undefined`
   */
  public edgeEndpoints(edgeId: EdgeId): [NodeId, NodeId] | undefined {
    const edge = this.edges.get(edgeId);
    return edge ? [edge.sourceId, edge.targetId] : undefined;
  }

  /**
   * 加入一条边，并把它 attach 到两端端口的 {@link Port.edges} 列表里。
   *
   * @param edge 待加入的边
   * @returns 当前图实例（链式调用）
   * @throws {Error} 当出现以下任一情况：
   *  - 同 ID 的边已存在
   *  - 起点 / 终点节点不存在或与图中已注册实例不一致
   *  - 起点 / 终点端口在对应节点上找不到
   *  - 起点不是输出端口、或终点不是输入端口
   *  - 两端 Socket 类型不兼容
   */
  public addEdge(edge: Edge<E>): this {
    if (this.edges.has(edge.id)) {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge: an edge with id "${String(edge.id)}" already exists.`,
      );
    }
    if (!this.nodes.has(edge.sourceId)) {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": source node "${String(edge.sourceId)}" does not exist.`,
      );
    }
    if (!this.nodes.has(edge.targetId)) {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": target node "${String(edge.targetId)}" does not exist.`,
      );
    }
    this._validate(edge);
    this.edges.set(edge.id, edge);
    this._link(edge);
    this._emit('edgeAdded', { edge });
    return this;
  }

  /**
   * 流式 API：按 `[节点ID, 端口名]` 元组连接两端，自动包装 Endpoint + Edge。
   *
   * @remarks
   * 等价于：
   * ```ts
   * graph.addEdge(new Edge(
   *   options?.id ?? autoId,
   *   new Endpoint(sourceNode, sourceNode.outputs[srcPort]!),
   *   new Endpoint(targetNode, targetNode.inputs[tgtPort]!),
   *   options?.weight,
   * ));
   * ```
   *
   * @param from `[源节点 ID, 输出端口名]`
   * @param to `[目标节点 ID, 输入端口名]`
   * @param options 可选：自定义 `id` 与 `weight`
   * @returns 创建的 {@link Edge} 实例
   * @throws {Error} 节点或端口不存在；或 {@link addEdge} 抛出的任何错误
   */
  public connect(
    from: readonly [NodeId, string],
    to: readonly [NodeId, string],
    options?: { id?: EdgeId; weight?: E },
  ): Edge<E> {
    const [sourceNodeId, sourcePortName] = from;
    const [targetNodeId, targetPortName] = to;

    const sourceNode = this.nodes.get(sourceNodeId);
    if (!sourceNode) {
      throw new Error(
        `[Graph "${String(this.id)}"] connect: source node "${String(sourceNodeId)}" not found.`,
      );
    }
    const targetNode = this.nodes.get(targetNodeId);
    if (!targetNode) {
      throw new Error(
        `[Graph "${String(this.id)}"] connect: target node "${String(targetNodeId)}" not found.`,
      );
    }

    const sourcePort = sourceNode.outputs[sourcePortName];
    if (!sourcePort) {
      throw new Error(
        `[Graph "${String(this.id)}"] connect: output port "${sourcePortName}" not found on node "${String(sourceNodeId)}".`,
      );
    }
    const targetPort = targetNode.inputs[targetPortName];
    if (!targetPort) {
      throw new Error(
        `[Graph "${String(this.id)}"] connect: input port "${targetPortName}" not found on node "${String(targetNodeId)}".`,
      );
    }

    const edgeId = options?.id ?? this._allocEdgeId();
    const edge = new Edge<E>(
      edgeId,
      new Endpoint(sourceNode, sourcePort),
      new Endpoint(targetNode, targetPort),
      options?.weight,
    );
    this.addEdge(edge);
    return edge;
  }

  /**
   * 移除一条边，并从两端端口的 {@link Port.edges} 列表里 detach。
   *
   * @param edgeId 边 ID
   * @returns 被移除的边；不存在时返回 `undefined`
   */
  public removeEdge(edgeId: EdgeId): Edge<E> | undefined {
    const edge = this.edges.get(edgeId);
    if (!edge) return undefined;
    this._unlink(edge);
    this.edges.delete(edgeId);
    this._emit('edgeRemoved', { edge });
    return edge;
  }

  /**
   * 流入指定节点的所有边。
   *
   * @param nodeId 节点 ID
   */
  public incomingEdges(nodeId: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const id of this._incomingEdgeIds(nodeId)) {
      const edge = this.edges.get(id);
      if (edge) result.push(edge);
    }
    return result;
  }

  /**
   * 流出指定节点的所有边。
   *
   * @param nodeId 节点 ID
   */
  public outgoingEdges(nodeId: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const id of this._outgoingEdgeIds(nodeId)) {
      const edge = this.edges.get(id);
      if (edge) result.push(edge);
    }
    return result;
  }

  /**
   * 与指定节点关联的所有边（流入 + 流出，自环只出现一次）。
   *
   * @param nodeId 节点 ID
   */
  public incidentEdges(nodeId: NodeId): Edge<E>[] {
    const seen = new Set<EdgeId>();
    const result: Edge<E>[] = [];
    for (const id of this._outgoingEdgeIds(nodeId)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const edge = this.edges.get(id);
      if (edge) result.push(edge);
    }
    for (const id of this._incomingEdgeIds(nodeId)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const edge = this.edges.get(id);
      if (edge) result.push(edge);
    }
    return result;
  }

  /**
   * 从 `source` 直接指向 `target` 的所有有向边。
   *
   * @param source 起点节点 ID
   * @param target 终点节点 ID
   */
  public edgesBetween(source: NodeId, target: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const id of this._outgoingEdgeIds(source)) {
      const edge = this.edges.get(id);
      if (edge && edge.targetId === target) result.push(edge);
    }
    return result;
  }

  /**
   * 连接 `left` 与 `right` 的所有边（不区分方向）。
   *
   * @param left 一端的节点 ID
   * @param right 另一端的节点 ID
   */
  public edgesConnecting(left: NodeId, right: NodeId): Edge<E>[] {
    if (left === right) return this.edgesBetween(left, right);
    return [...this.edgesBetween(left, right), ...this.edgesBetween(right, left)];
  }

  /**
   * 指定节点的前驱节点（直接指向它的节点）。
   *
   * @param nodeId 节点 ID
   */
  public predecessors(nodeId: NodeId): NodeId[] {
    const result: NodeId[] = [];
    for (const id of this._incomingEdgeIds(nodeId)) {
      const edge = this.edges.get(id);
      if (edge) result.push(edge.sourceId);
    }
    return result;
  }

  /**
   * 指定节点的后继节点（被它直接指向的节点）。
   *
   * @param nodeId 节点 ID
   */
  public successors(nodeId: NodeId): NodeId[] {
    const result: NodeId[] = [];
    for (const id of this._outgoingEdgeIds(nodeId)) {
      const edge = this.edges.get(id);
      if (edge) result.push(edge.targetId);
    }
    return result;
  }

  /**
   * 指定节点的所有邻居（前驱 + 后继）。
   *
   * @param nodeId 节点 ID
   */
  public adjacencies(nodeId: NodeId): NodeId[] {
    return [...this.predecessors(nodeId), ...this.successors(nodeId)];
  }

  /**
   * 入度：流入指定节点的边数。
   *
   * @remarks 直接对节点的所有输入端口求和，O(num_inputs)。
   * @param nodeId 节点 ID
   */
  public inDegree(nodeId: NodeId): number {
    const node = this.nodes.get(nodeId);
    if (!node) return 0;
    let count = 0;
    for (const key in node.inputs) {
      const port = node.inputs[key];
      if (port) count += port.edges.length;
    }
    return count;
  }

  /**
   * 出度：流出指定节点的边数。
   *
   * @remarks 直接对节点的所有输出端口求和，O(num_outputs)。
   * @param nodeId 节点 ID
   */
  public outDegree(nodeId: NodeId): number {
    const node = this.nodes.get(nodeId);
    if (!node) return 0;
    let count = 0;
    for (const key in node.outputs) {
      const port = node.outputs[key];
      if (port) count += port.edges.length;
    }
    return count;
  }

  /**
   * 总度数：入度 + 出度。
   *
   * @param nodeId 节点 ID
   */
  public degree(nodeId: NodeId): number {
    return this.inDegree(nodeId) + this.outDegree(nodeId);
  }

  /** 源节点：入度为 0 的节点。 */
  public sources(): Vertex<N>[] {
    return this._filterByDegree((inDegree) => inDegree === 0);
  }

  /** 汇节点：出度为 0 的节点。 */
  public sinks(): Vertex<N>[] {
    return this._filterByDegree((_inDegree, outDegree) => outDegree === 0);
  }

  /** 孤立节点：入度与出度均为 0 的节点。 */
  public isolated(): Vertex<N>[] {
    return this._filterByDegree((inDegree, outDegree) => inDegree === 0 && outDegree === 0);
  }

  /**
   * 按节点的入/出度筛选节点；公用 {@link sources}、{@link sinks}、{@link isolated} 的扫描骨架。
   *
   * @param check 判定函数，接收节点的入度和出度
   * @internal
   */
  private _filterByDegree(check: (inDegree: number, outDegree: number) => boolean): Vertex<N>[] {
    const result: Vertex<N>[] = [];
    for (const node of this.nodes.values()) {
      if (check(this.inDegree(node.id), this.outDegree(node.id))) result.push(node);
    }
    return result;
  }

  /**
   * 是否存在从 `source` 直接到 `target` 的边。
   *
   * @param source 起点节点 ID
   * @param target 终点节点 ID
   */
  public adjacent(source: NodeId, target: NodeId): boolean {
    return this.findEdge(source, target) !== undefined;
  }

  /** 图是否为空（不含任何节点）。 */
  public empty(): boolean {
    return this.nodes.size === 0;
  }

  /**
   * 清空所有节点与边。
   *
   * @remarks 不触发任何事件 — 批量清空场景下事件风暴反而碍事。
   *   订阅者保留：clear 不取消用户订阅。
   */
  public clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this._order.length = 0;
    this._index.clear();
  }

  /**
   * 序列化为可用 `JSON.stringify` 输出的纯对象快照。
   *
   * @returns 描述当前图的 {@link GraphJson} 结构
   */
  public toJson(): GraphJson<N, E> {
    const nodes: GraphJsonNode<N>[] = Array.from(this.nodes.values()).map(node => ({
      id: node.id,
      weight: node.weight,
      inputs: json(node.inputs),
      outputs: json(node.outputs),
    }));
    const edges: GraphJsonEdge<E>[] = Array.from(this.edges.values()).map(edge => ({
      id: edge.id,
      source: { nodeId: edge.source.nodeId, portId: edge.source.portId },
      target: { nodeId: edge.target.nodeId, portId: edge.target.portId },
      weight: edge.weight,
    }));
    return { id: this.id, nodes, edges };
  }

  /**
   * 订阅图变更事件。
   *
   * @template K 事件名
   * @param event 事件名
   * @param listener 回调
   * @returns 取消订阅函数
   *
   * @example
   * ```ts
   * const off = graph.on('edgeAdded', ({ edge }) => console.log(edge.id));
   * off(); // 取消订阅
   * ```
   */
  public on<K extends GraphEventName>(
    event: K,
    listener: GraphListener<GraphEventMap<N, E>[K]>,
  ): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener as GraphListener<unknown>);
    return () => { set!.delete(listener as GraphListener<unknown>); };
  }

  /**
   * 取消订阅指定回调。
   *
   * @template K 事件名
   * @param event 事件名
   * @param listener 之前传给 {@link on} 的回调
   */
  public off<K extends GraphEventName>(
    event: K,
    listener: GraphListener<GraphEventMap<N, E>[K]>,
  ): void {
    this._listeners.get(event)?.delete(listener as GraphListener<unknown>);
  }

  /**
   * 同步派发事件给所有订阅者。
   *
   * @internal
   */
  private _emit<K extends GraphEventName>(
    event: K,
    payload: GraphEventMap<N, E>[K],
  ): void {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    for (const listener of set) {
      (listener as GraphListener<GraphEventMap<N, E>[K]>)(payload);
    }
  }

  /**
   * 分配下一个可用边 ID（跳过已存在 ID 以避免冲突）。
   *
   * @internal
   */
  private _allocEdgeId(): EdgeId {
    let id: EdgeId;
    do {
      id = `e${this._sequence++}` as EdgeId;
    } while (this.edges.has(id));
    return id;
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
  public neighbors(nodeId: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction === 'input') return this.predecessors(nodeId);
    if (direction === 'output') return this.successors(nodeId);
    return this.adjacencies(nodeId);
  }

  /** {@inheritdoc Neighbors.incomingNeighbors} */
  public incomingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    return this.predecessors(nodeId);
  }

  /** {@inheritdoc Neighbors.outgoingNeighbors} */
  public outgoingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    return this.successors(nodeId);
  }

  /** {@inheritdoc IntoEdgeViews.getEdges} */
  public *getEdges(): Iterable<EdgeView<E>> {
    for (const edge of this.edges.values()) {
      yield {
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        weight: edge.weight,
      };
    }
  }

  /** {@inheritdoc IntoEdgeViews.getIncomingEdges} */
  public *getIncomingEdges(nodeId: NodeId): Iterable<EdgeView<E>> {
    for (const id of this._incomingEdgeIds(nodeId)) {
      const edge = this.edges.get(id);
      if (!edge) continue;
      yield {
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        weight: edge.weight,
      };
    }
  }

  /** {@inheritdoc IntoEdgeViews.getOutgoingEdges} */
  public *getOutgoingEdges(nodeId: NodeId): Iterable<EdgeView<E>> {
    for (const id of this._outgoingEdgeIds(nodeId)) {
      const edge = this.edges.get(id);
      if (!edge) continue;
      yield {
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        weight: edge.weight,
      };
    }
  }

  /** {@inheritdoc NodeIndexable.bound} (O(1)) */
  public bound(): number {
    return this._order.length;
  }

  /** {@inheritdoc NodeIndexable.at} (O(1)) */
  public at(index: number): NodeId | undefined {
    return this._order[index];
  }

  /** {@inheritdoc NodeIndexable.indexOf} (O(1)) */
  public indexOf(nodeId: NodeId): number {
    return this._index.get(nodeId) ?? -1;
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

  /**
   * 校验边的端口是否在所属节点上注册、方向是否正确、Socket 是否兼容；不通过时抛出带上下文的错误。
   *
   * @remarks 直接使用 {@link Endpoint.port} 引用，省去按 portId 在端口字典里再次查找。
   *
   * @param edge 要校验的边
   * @throws {Error} 当端口未注册、方向错误或 Socket 不兼容
   * @internal
   */
  private _validate(edge: Edge<E>): void {
    const sourcePort = edge.source.port;
    const targetPort = edge.target.port;

    // 端点必须指向当前图实际持有的 Node 实例；否则端口列表会被记到一个 "孤儿" 节点上，
    // 导致 graph.outgoingEdges(sourceId) 等邻接查询读不到这条边。
    if (this.nodes.get(edge.sourceId) !== edge.source.node) {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": source endpoint references a Node that is not the one registered under id "${String(edge.sourceId)}" in this graph.`,
      );
    }
    if (this.nodes.get(edge.targetId) !== edge.target.node) {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": target endpoint references a Node that is not the one registered under id "${String(edge.targetId)}" in this graph.`,
      );
    }

    if (!this._owns(edge.source.node.outputs, sourcePort)) {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": source port "${String(sourcePort.id)}" not found on node "${String(edge.source.nodeId)}".`,
      );
    }
    if (!this._owns(edge.target.node.inputs, targetPort)) {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": target port "${String(targetPort.id)}" not found on node "${String(edge.target.nodeId)}".`,
      );
    }

    if (sourcePort.direction !== 'output') {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": source endpoint port "${String(sourcePort.id)}" must be an output port (got direction="${sourcePort.direction}").`,
      );
    }
    if (targetPort.direction !== 'input') {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": target endpoint port "${String(targetPort.id)}" must be an input port (got direction="${targetPort.direction}").`,
      );
    }

    if (!sourcePort.socket.matches(targetPort.socket)) {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": socket type "${sourcePort.socket.name}" (source) is incompatible with "${targetPort.socket.name}" (target).`,
      );
    }
  }

  /**
   * 把边登记到两端端口的 {@link Port.edges} 列表里。
   *
   * @internal
   */
  private _link(edge: Edge<E>): void {
    edge.source.port.attach(edge.id);
    edge.target.port.attach(edge.id);
  }

  /**
   * 把边从两端端口的 {@link Port.edges} 列表里解除。
   *
   * @param edge 待解除的边
   * @internal
   */
  private _unlink(edge: Edge<E>): void {
    edge.source.port.detach(edge.id);
    edge.target.port.detach(edge.id);
  }

  /**
   * 用引用相等检测端口是否在节点的端口字典中注册。
   *
   * @internal
   */
  private _owns(ports: PortDict, target: Port): boolean {
    for (const key in ports) {
      if (ports[key] === target) return true;
    }
    return false;
  }
}

/**
 * 将端口字典序列化为 `{ portName: { id, socket } | null }`。
 *
 * @internal
 */
function json(
  ports: PortDict,
): Record<string, { id: PortId; socket: string } | null> {
  const result: Record<string, { id: PortId; socket: string } | null> = {};
  for (const [name, port] of Object.entries(ports)) {
    result[name] = port ? { id: port.id, socket: port.socket.name } : null;
  }
  return result;
}
