/**
 * 基础数据元模型 (classic)
 *
 * @remarks
 * 这里集中所有运行时类：{@link Socket}、{@link Port}、{@link Input}、{@link Output}、
 * {@link Node}、{@link Endpoint}、{@link Edge}、{@link Graph}。
 * 类型与算法接口在 {@link ./types}，算法在 {@link ./algorithms}。
 */

import type {
  Adjacency,
  CycleInfo,
  Direction,
  EdgeId,
  GraphId,
  Inputs,
  NodeId,
  Outputs,
  PortDict,
  PortId,
  Sockets,
  StoredNode,
  TopoSortResult,
} from './types';

/**
 * Socket 描述端口承载的数据类型，用于校验边连接的兼容性。
 *
 * @remarks
 * 内置类型可通过静态字段获取：{@link Socket.number}、{@link Socket.string}、{@link Socket.any} 等。
 *
 * @template T Socket 的字面量名称
 */
export class Socket<T extends string = string> {
  /** Socket 类型名（例如 `'number'`、`'string'`）。 */
  public readonly name: T;

  /** 兼容 Socket 列表；当前 Socket 可与列表中任意一个互连。 */
  public readonly compatible?: ReadonlyArray<Socket>;

  /**
   * @param name Socket 名称
   * @param compatible 可与之互连的兼容 Socket 列表
   */
  public constructor(name: T, compatible?: ReadonlyArray<Socket>) {
    this.name = name;
    this.compatible = compatible;
  }

  /**
   * 工厂方法：创建一个 Socket。
   *
   * @template T Socket 名称的字面量类型
   * @param name Socket 名称
   * @param compatible 可与之互连的兼容 Socket 列表
   * @returns 新建的 Socket 实例
   */
  public static from<T extends string>(name: T, compatible?: ReadonlyArray<Socket>): Socket<T> {
    return new Socket(name, compatible);
  }

  /**
   * 判断当前 Socket 是否与另一个 Socket 兼容。
   *
   * @remarks
   * 兼容规则：
   * 1. 任一方为 `'*'` (any) 时兼容；
   * 2. 名称相同时兼容；
   * 3. 名称在 {@link compatible} 列表中时兼容。
   *
   * @param other 要比较的 Socket
   * @returns 是否兼容
   */
  public matches(other: Socket): boolean {
    if (this.name === '*' || other.name === '*') return true;
    if (this.name === other.name) return true;
    return this.compatible?.some(socket => socket.name === other.name) ?? false;
  }

  /** 内置 number 类型 Socket。 */
  public static readonly number: Socket<'number'> = Object.freeze(new Socket('number')) as Socket<'number'>;
  /** 内置 string 类型 Socket。 */
  public static readonly string: Socket<'string'> = Object.freeze(new Socket('string')) as Socket<'string'>;
  /** 内置 boolean 类型 Socket。 */
  public static readonly boolean: Socket<'boolean'> = Object.freeze(new Socket('boolean')) as Socket<'boolean'>;
  /** 内置 object 类型 Socket。 */
  public static readonly object: Socket<'object'> = Object.freeze(new Socket('object')) as Socket<'object'>;
  /** 内置 array 类型 Socket。 */
  public static readonly array: Socket<'array'> = Object.freeze(new Socket('array')) as Socket<'array'>;
  /** 内置 exec 类型 Socket，用于纯执行流连接，不传递数据。 */
  public static readonly exec: Socket<'exec'> = Object.freeze(new Socket('exec')) as Socket<'exec'>;
  /** 通配 Socket，与任意类型兼容。 */
  public static readonly any: Socket<'*'> = Object.freeze(new Socket('*')) as Socket<'*'>;
}

/**
 * 端口抽象基类。子类决定方向（{@link Input} / {@link Output}）。
 *
 * @template S 关联的 Socket 类型
 */
export abstract class Port<S extends Socket = Socket> {
  /** 端口方向：`'input'` 或 `'output'`。 */
  public abstract readonly direction: Direction;

  /**
   * @param socket 端口承载的 Socket
   * @param id 端口唯一标识
   */
  protected constructor(
    public readonly socket: S,
    public readonly id: PortId,
  ) {}
}

/**
 * 输入端口。可被多条边连接（fan-in），并维护连接到本端口的边列表。
 *
 * @template S 关联的 Socket 类型
 */
export class Input<S extends Socket = Socket> extends Port<S> {
  public readonly direction: 'input' = 'input';

  /** 已连接到本端口的边 ID 列表。 */
  public readonly edges: EdgeId[] = [];

  /**
   * @param socket 端口承载的 Socket
   * @param id 端口唯一标识
   */
  public constructor(socket: S, id: PortId) {
    super(socket, id);
  }

  /** 当前是否至少连接了一条边。 */
  public get connected(): boolean {
    return this.edges.length > 0;
  }

  /**
   * 关联一条边到本端口（去重）。
   *
   * @param edge 要关联的边 ID
   */
  public attach(edge: EdgeId): void {
    if (!this.edges.includes(edge)) this.edges.push(edge);
  }

  /**
   * 解除一条边与本端口的关联。
   *
   * @param edge 要解除的边 ID
   * @returns 是否成功解除（边原本存在则返回 `true`）
   */
  public detach(edge: EdgeId): boolean {
    const index = this.edges.indexOf(edge);
    if (index === -1) return false;
    this.edges.splice(index, 1);
    return true;
  }
}

/**
 * 输出端口。可向多个输入端口扇出 (fan-out)，本身不维护边列表。
 *
 * @template S 关联的 Socket 类型
 */
export class Output<S extends Socket = Socket> extends Port<S> {
  public readonly direction: 'output' = 'output';

  /**
   * @param socket 端口承载的 Socket
   * @param id 端口唯一标识
   */
  public constructor(socket: S, id: PortId) {
    super(socket, id);
  }
}

/**
 * 图中的节点。携带类型化的输入/输出端口集合，以及任意数据载荷 (`weight`)。
 *
 * @template I 输入端口的 Sockets 形态
 * @template O 输出端口的 Sockets 形态
 * @template W 节点附带的数据载荷类型
 *
 * @example
 * ```ts
 * type AddIn = { lhs: Socket<'number'>; rhs: Socket<'number'> };
 * type AddOut = { sum: Socket<'number'> };
 *
 * const adder = new Node<AddIn, AddOut, { label: string }>('n1' as NodeId, { label: 'add' });
 * adder.addInput('lhs', Socket.number);
 * adder.addInput('rhs', Socket.number);
 * adder.addOutput('sum', Socket.number);
 * ```
 */
export class Node<
  I extends Sockets = Sockets,
  O extends Sockets = Sockets,
  W = unknown,
> {
  /** 输入端口字典：键为端口名，值为 {@link Input}。 */
  public readonly inputs: Inputs<I> = {} as Inputs<I>;

  /** 输出端口字典：键为端口名，值为 {@link Output}。 */
  public readonly outputs: Outputs<O> = {} as Outputs<O>;

  /** 附带在节点上的数据载荷。 */
  public weight: W | undefined;

  /**
   * @param id 节点唯一标识
   * @param weight 节点附带的数据载荷
   */
  public constructor(public readonly id: NodeId, weight?: W) {
    this.weight = weight;
  }

  /**
   * 创建并注册一个输入端口。
   *
   * @template K 端口名（受 `I` 的键约束）
   * @param name 端口名
   * @param socket 端口的 Socket 类型
   * @param id 端口 ID；省略时按 `${nodeId}:input:${name}` 生成
   * @returns 创建好的输入端口
   */
  public addInput<K extends string & keyof I>(
    name: K,
    socket: I[K],
    id?: PortId,
  ): Input<I[K]> {
    const portId = id ?? (`${String(this.id)}:input:${name}` as PortId);
    const port = new Input<I[K]>(socket, portId);
    this.inputs[name] = port;
    return port;
  }

  /**
   * 创建并注册一个输出端口。
   *
   * @template K 端口名（受 `O` 的键约束）
   * @param name 端口名
   * @param socket 端口的 Socket 类型
   * @param id 端口 ID；省略时按 `${nodeId}:output:${name}` 生成
   * @returns 创建好的输出端口
   */
  public addOutput<K extends string & keyof O>(
    name: K,
    socket: O[K],
    id?: PortId,
  ): Output<O[K]> {
    const portId = id ?? (`${String(this.id)}:output:${name}` as PortId);
    const port = new Output<O[K]>(socket, portId);
    this.outputs[name] = port;
    return port;
  }

  /**
   * 移除指定输入端口。
   *
   * @param name 端口名
   * @returns 是否成功移除（端口原本存在则返回 `true`）
   */
  public removeInput(name: string & keyof I): boolean {
    if (!(name in this.inputs)) return false;
    delete this.inputs[name];
    return true;
  }

  /**
   * 移除指定输出端口。
   *
   * @param name 端口名
   * @returns 是否成功移除（端口原本存在则返回 `true`）
   */
  public removeOutput(name: string & keyof O): boolean {
    if (!(name in this.outputs)) return false;
    delete this.outputs[name];
    return true;
  }

  /**
   * 是否已声明指定名称的输入端口。
   *
   * @param name 端口名
   */
  public hasInput(name: string & keyof I): boolean {
    return name in this.inputs;
  }

  /**
   * 是否已声明指定名称的输出端口。
   *
   * @param name 端口名
   */
  public hasOutput(name: string & keyof O): boolean {
    return name in this.outputs;
  }

  /**
   * 按名称获取输入端口。
   *
   * @template K 端口名
   * @param name 端口名
   * @returns 端口实例；未声明时返回 `undefined`
   */
  public input<K extends string & keyof I>(name: K): Input<I[K]> | undefined {
    return this.inputs[name] as Input<I[K]> | undefined;
  }

  /**
   * 按名称获取输出端口。
   *
   * @template K 端口名
   * @param name 端口名
   * @returns 端口实例；未声明时返回 `undefined`
   */
  public output<K extends string & keyof O>(name: K): Output<O[K]> | undefined {
    return this.outputs[name] as Output<O[K]> | undefined;
  }
}

/**
 * 端点 (endpoint) = 节点 + 节点上的某个端口，用于描述边的两端。
 *
 * @template N 节点类型
 * @template P 端口类型
 */
export class Endpoint<N extends Node = Node, P extends Port = Port> {
  /**
   * @param node 端点所在的节点
   * @param port 端点对应的端口
   */
  public constructor(
    public readonly node: N,
    public readonly port: P,
  ) {}

  /** 端点所在节点的 ID（{@link node}.id 的便捷访问器）。 */
  public get nodeId(): NodeId {
    return this.node.id;
  }

  /** 端点对应端口的 ID（{@link port}.id 的便捷访问器）。 */
  public get portId(): PortId {
    return this.port.id;
  }
}

/**
 * 图中的有向边，从 `source` 端点指向 `target` 端点。
 *
 * @template W 边附带的数据载荷类型
 */
export class Edge<W = unknown> {
  /** 附带在边上的数据载荷。 */
  public weight: W | undefined;

  /**
   * @param id 边唯一标识
   * @param source 起点 (输出端点)
   * @param target 终点 (输入端点)
   * @param weight 边附带的数据载荷
   */
  public constructor(
    public readonly id: EdgeId,
    public readonly source: Endpoint,
    public readonly target: Endpoint,
    weight?: W,
  ) {
    this.weight = weight;
  }

  /** 起点节点 ID。 */
  public get sourceId(): NodeId {
    return this.source.nodeId;
  }

  /** 终点节点 ID。 */
  public get targetId(): NodeId {
    return this.target.nodeId;
  }

  /**
   * 本条边是否与给定节点相关（作为起点或终点）。
   *
   * @param nodeId 节点 ID
   */
  public connects(nodeId: NodeId): boolean {
    return this.source.nodeId === nodeId || this.target.nodeId === nodeId;
  }

  /**
   * 给定方向，返回另一端的节点 ID。
   *
   * @param direction `'input'` 视角（从终点看）返回起点；`'output'` 视角（从起点看）返回终点
   * @returns 对侧节点的 ID
   */
  public opposite(direction: Direction): NodeId {
    return direction === 'input' ? this.source.nodeId : this.target.nodeId;
  }
}

/**
 * 有向图，承载节点 (`Node`) 与边 (`Edge`)，并提供拓扑排序、邻接查询等基础算法。
 *
 * @remarks
 * 设计要点：
 * - 节点通过 {@link addNode} 加入；不同节点可拥有不同的输入/输出 Sockets 形态。
 * - 边通过 {@link addEdge} 加入，会校验端口存在性与 Socket 兼容性。
 * - 拓扑排序结果会被缓存；任何结构变更都会通过 `_invalidate` 让缓存失效。
 *
 * @template N 节点附带的数据载荷类型
 * @template E 边附带的数据载荷类型
 */
export class Graph<N = unknown, E = unknown> {
  /** 节点存储：NodeId → Node。 */
  public readonly nodes = new Map<NodeId, StoredNode<N>>();

  /** 边存储：EdgeId → Edge。 */
  public readonly edges = new Map<EdgeId, Edge<E>>();

  /** 拓扑/邻接缓存是否过期。 */
  private _dirty = true;

  /** 拓扑排序结果缓存；`null` 表示尚未计算或已失效。 */
  private _topology: NodeId[] | null = null;

  /** 环路信息缓存；`null` 表示尚未计算或已失效。 */
  private _cycleInfo: CycleInfo | null = null;

  /** 邻接缓存；`_adjDirty` 为 `true` 时需要重建。 */
  private _adjCache: Adjacency | null = null;

  /** 邻接缓存失效标志。 */
  private _adjDirty = true;

  /**
   * @param id 图的唯一标识
   */
  public constructor(public readonly id: GraphId) {}

  // ============================================================
  // 邻接缓存管理
  // ============================================================

  /**
   * 取邻接缓存，必要时重建。
   *
   * @returns 当前有效的邻接快照
   * @internal
   */
  private _adj(): Adjacency {
    if (this._adjDirty || !this._adjCache) {
      this._adjCache = this._buildAdj();
      this._adjDirty = false;
    }
    return this._adjCache;
  }

  /**
   * 一次性扫描所有节点与边，构建完整邻接缓存。
   *
   * @returns 新的 {@link Adjacency} 快照
   * @internal
   */
  private _buildAdj(): Adjacency {
    const outgoingEdges = new Map<NodeId, EdgeId[]>();
    const incomingEdges = new Map<NodeId, EdgeId[]>();
    const successors = new Map<NodeId, NodeId[]>();
    const predecessors = new Map<NodeId, NodeId[]>();
    const inDegree = new Map<NodeId, number>();
    const outDegree = new Map<NodeId, number>();

    for (const nodeId of this.nodes.keys()) {
      outgoingEdges.set(nodeId, []);
      incomingEdges.set(nodeId, []);
      successors.set(nodeId, []);
      predecessors.set(nodeId, []);
      inDegree.set(nodeId, 0);
      outDegree.set(nodeId, 0);
    }

    for (const edge of this.edges.values()) {
      const { sourceId, targetId } = edge;

      // 节点初始化时已写入空数组，因此可省去 `??` 兜底。
      outgoingEdges.get(sourceId)!.push(edge.id);
      successors.get(sourceId)!.push(targetId);
      outDegree.set(sourceId, outDegree.get(sourceId)! + 1);

      incomingEdges.get(targetId)!.push(edge.id);
      predecessors.get(targetId)!.push(sourceId);
      inDegree.set(targetId, inDegree.get(targetId)! + 1);
    }

    return { outgoingEdges, incomingEdges, successors, predecessors, inDegree, outDegree };
  }

  /**
   * 标记邻接缓存失效。
   *
   * @internal
   */
  private _invalidateAdj(): void {
    this._adjDirty = true;
    this._adjCache = null;
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
    this.nodes.set(node.id, node as unknown as StoredNode<N>);
    this._invalidate();
    return this;
  }

  /**
   * 移除节点，并连带删除所有与该节点相关的边。
   *
   * @param nodeId 节点 ID
   * @returns 被移除的节点；不存在时返回 `undefined`
   */
  public removeNode(nodeId: NodeId): StoredNode<N> | undefined {
    const node = this.nodes.get(nodeId);
    if (!node) return undefined;
    const adj = this._adj();
    const incident = new Set<EdgeId>();
    for (const id of adj.outgoingEdges.get(nodeId) ?? []) incident.add(id);
    for (const id of adj.incomingEdges.get(nodeId) ?? []) incident.add(id);
    for (const edgeId of incident) {
      const edge = this.edges.get(edgeId);
      if (!edge) continue;
      // 终点节点即将随 nodeId 一起删除时，无需在其输入端口上 detach。
      if (edge.targetId !== nodeId) this._link(edge, false);
      this.edges.delete(edgeId);
    }
    this.nodes.delete(nodeId);
    this._invalidate();
    this._invalidateAdj();
    return node;
  }

  /**
   * 按 ID 获取节点。
   *
   * @param nodeId 节点 ID
   * @returns 节点实例；不存在时返回 `undefined`
   */
  public getNode(nodeId: NodeId): StoredNode<N> | undefined {
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

  /** 遍历所有节点。 */
  public getNodes(): IterableIterator<StoredNode<N>> {
    return this.nodes.values();
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

  /** 遍历所有边。 */
  public getEdges(): IterableIterator<Edge<E>> {
    return this.edges.values();
  }

  /**
   * 查找从 `source` 直接指向 `target` 的第一条边（petgraph `find_edge` 等价物）。
   *
   * @remarks 存在多重边时只返回首条；如需全部请用 {@link edgesBetween}。
   *
   * @param source 起点节点 ID
   * @param target 终点节点 ID
   * @returns 边实例；不存在时返回 `undefined`
   */
  public findEdge(source: NodeId, target: NodeId): Edge<E> | undefined {
    const ids = this._adj().outgoingEdges.get(source);
    if (!ids?.length) return undefined;
    for (const id of ids) {
      const edge = this.edges.get(id);
      if (edge && edge.targetId === target) return edge;
    }
    return undefined;
  }

  /**
   * 取边的两端节点 ID（petgraph `edge_endpoints` 等价物）。
   *
   * @param edgeId 边 ID
   * @returns `[sourceId, targetId]`；边不存在时返回 `undefined`
   */
  public edgeEndpoints(edgeId: EdgeId): [NodeId, NodeId] | undefined {
    const edge = this.edges.get(edgeId);
    return edge ? [edge.sourceId, edge.targetId] : undefined;
  }

  /**
   * 加入一条边，并将其登记到目标输入端口的连接列表中。
   *
   * @param edge 待加入的边
   * @returns 当前图实例（链式调用）
   * @throws {Error} 当出现以下任一情况：
   *  - 同 ID 的边已存在
   *  - 起点 / 终点节点不存在
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
    this._link(edge, true);
    this._invalidate();
    this._invalidateAdj();
    return this;
  }

  /**
   * 移除一条边，并将其从目标输入端口的连接列表中解除。
   *
   * @param edgeId 边 ID
   * @returns 被移除的边；不存在时返回 `undefined`
   */
  public removeEdge(edgeId: EdgeId): Edge<E> | undefined {
    const edge = this.edges.get(edgeId);
    if (!edge) return undefined;
    this._link(edge, false);
    this.edges.delete(edgeId);
    this._invalidate();
    this._invalidateAdj();
    return edge;
  }

  /**
   * 流入指定节点的所有边。
   *
   * @param nodeId 节点 ID
   */
  public incomingEdges(nodeId: NodeId): Edge<E>[] {
    return this._collectEdges(this._adj().incomingEdges.get(nodeId));
  }

  /**
   * 流出指定节点的所有边。
   *
   * @param nodeId 节点 ID
   */
  public outgoingEdges(nodeId: NodeId): Edge<E>[] {
    return this._collectEdges(this._adj().outgoingEdges.get(nodeId));
  }

  /**
   * 与指定节点关联的所有边（流入 + 流出，自环只出现一次）。
   *
   * @param nodeId 节点 ID
   */
  public incidentEdges(nodeId: NodeId): Edge<E>[] {
    const adj = this._adj();
    const outgoing = adj.outgoingEdges.get(nodeId);
    const incoming = adj.incomingEdges.get(nodeId);
    if (!outgoing?.length && !incoming?.length) return [];

    const seen = new Set<EdgeId>();
    const result: Edge<E>[] = [];
    const push = (id: EdgeId): void => {
      if (seen.has(id)) return;
      const edge = this.edges.get(id);
      if (!edge) return;
      seen.add(id);
      result.push(edge);
    };

    if (outgoing) for (const id of outgoing) push(id);
    if (incoming) for (const id of incoming) push(id);
    return result;
  }

  /**
   * 从 `source` 直接指向 `target` 的所有有向边。
   *
   * @param source 起点节点 ID
   * @param target 终点节点 ID
   */
  public edgesBetween(source: NodeId, target: NodeId): Edge<E>[] {
    const ids = this._adj().outgoingEdges.get(source);
    if (!ids?.length) return [];
    const result: Edge<E>[] = [];
    for (const id of ids) {
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
    const result = this.edgesBetween(left, right);
    const reverse = this.edgesBetween(right, left);
    if (reverse.length > 0) result.push(...reverse);
    return result;
  }

  /**
   * 将一组边 ID 解析为对应的 Edge 对象，跳过已不存在的条目。
   *
   * @param ids 要解析的边 ID 列表
   * @internal
   */
  private _collectEdges(ids: ReadonlyArray<EdgeId> | undefined): Edge<E>[] {
    if (!ids?.length) return [];
    const result: Edge<E>[] = [];
    for (const id of ids) {
      const edge = this.edges.get(id);
      if (edge) result.push(edge);
    }
    return result;
  }

  /**
   * 指定节点的前驱节点（直接指向它的节点）。
   *
   * @param nodeId 节点 ID
   */
  public predecessors(nodeId: NodeId): NodeId[] {
    return this._adj().predecessors.get(nodeId) ?? [];
  }

  /**
   * 指定节点的后继节点（被它直接指向的节点）。
   *
   * @param nodeId 节点 ID
   */
  public successors(nodeId: NodeId): NodeId[] {
    return this._adj().successors.get(nodeId) ?? [];
  }

  /**
   * 指定节点的所有邻居（前驱 + 后继）。
   *
   * @param nodeId 节点 ID
   */
  public adjacencies(nodeId: NodeId): NodeId[] {
    const adj = this._adj();
    const predecessors = adj.predecessors.get(nodeId);
    const successors = adj.successors.get(nodeId);
    if (!predecessors?.length && !successors?.length) return [];
    return [...(predecessors ?? []), ...(successors ?? [])];
  }

  /**
   * 入度：流入指定节点的边数。
   *
   * @param nodeId 节点 ID
   */
  public inDegree(nodeId: NodeId): number {
    return this._adj().inDegree.get(nodeId) ?? 0;
  }

  /**
   * 出度：流出指定节点的边数。
   *
   * @param nodeId 节点 ID
   */
  public outDegree(nodeId: NodeId): number {
    return this._adj().outDegree.get(nodeId) ?? 0;
  }

  /**
   * 总度数：入度 + 出度。
   *
   * @param nodeId 节点 ID
   */
  public degree(nodeId: NodeId): number {
    const adj = this._adj();
    return (adj.inDegree.get(nodeId) ?? 0) + (adj.outDegree.get(nodeId) ?? 0);
  }

  /** 源节点：入度为 0 的节点。 */
  public sources(): StoredNode<N>[] {
    return this._filterByDegree((inDeg) => inDeg === 0);
  }

  /** 汇节点：出度为 0 的节点。 */
  public sinks(): StoredNode<N>[] {
    return this._filterByDegree((_inDeg, outDeg) => outDeg === 0);
  }

  /** 孤立节点：入度与出度均为 0 的节点。 */
  public isolated(): StoredNode<N>[] {
    return this._filterByDegree((inDeg, outDeg) => inDeg === 0 && outDeg === 0);
  }

  /**
   * 按节点的入/出度筛选节点；公用 {@link sources}、{@link sinks}、{@link isolated} 的扫描骨架。
   *
   * @param check 判定函数，接收节点的入度和出度
   * @internal
   */
  private _filterByDegree(check: (inDeg: number, outDeg: number) => boolean): StoredNode<N>[] {
    const adj = this._adj();
    const result: StoredNode<N>[] = [];
    for (const node of this.nodes.values()) {
      const inDeg = adj.inDegree.get(node.id) ?? 0;
      const outDeg = adj.outDegree.get(node.id) ?? 0;
      if (check(inDeg, outDeg)) result.push(node);
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

  /** 清空所有节点与边。 */
  public clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this._invalidate();
    this._invalidateAdj();
  }

  /**
   * 序列化为可用 `JSON.stringify` 输出的纯对象快照。
   *
   * @returns 描述当前图的纯对象
   */
  public toJson(): object {
    return {
      id: this.id,
      nodes: Array.from(this.nodes.values()).map(node => ({
        id: node.id,
        weight: node.weight,
        inputs: portDictToJson(node.inputs),
        outputs: portDictToJson(node.outputs),
      })),
      edges: Array.from(this.edges.values()).map(edge => ({
        id: edge.id,
        source: { nodeId: edge.source.nodeId, portId: edge.source.portId },
        target: { nodeId: edge.target.nodeId, portId: edge.target.portId },
        weight: edge.weight,
      })),
    };
  }

  // ============================================================
  // Visitor Trait 实现 - GraphRef 接口
  // ============================================================

  /** {@inheritdoc GraphBase.nodeIds} */
  public readonly nodeIds: Iterable<NodeId> = {
    [Symbol.iterator]: () => this.nodes.keys(),
  };

  /** {@inheritdoc GraphBase.edgeIds} */
  public readonly edgeIds: Iterable<EdgeId> = {
    [Symbol.iterator]: () => this.edges.keys(),
  };

  /** {@inheritdoc GraphBase.nodeCount} */
  public nodeCount(): number {
    return this.nodes.size;
  }

  /** {@inheritdoc GraphBase.edgeCount} */
  public edgeCount(): number {
    return this.edges.size;
  }

  /** {@inheritdoc IntoNeighbors.neighbors} */
  public neighbors(nodeId: NodeId): Iterable<NodeId> {
    return this.adjacencies(nodeId);
  }

  /** {@inheritdoc IntoNeighbors.incomingNeighbors} */
  public incomingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    return this.predecessors(nodeId);
  }

  /** {@inheritdoc IntoNeighbors.outgoingNeighbors} */
  public outgoingNeighbors(nodeId: NodeId): Iterable<NodeId> {
    return this.successors(nodeId);
  }

  /** {@inheritdoc NodeIndexable.nodeIdAt} */
  public nodeIdAt(index: number): NodeId | undefined {
    if (index < 0 || index >= this.nodes.size) return undefined;
    let i = 0;
    for (const nodeId of this.nodes.keys()) {
      if (i === index) return nodeId;
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

  /** {@inheritdoc Visitable.visitMap} */
  public visitMap(): Map<NodeId, boolean> {
    const map = new Map<NodeId, boolean>();
    for (const id of this.nodes.keys()) map.set(id, false);
    return map;
  }

  /** {@inheritdoc Visitable.resetMap} */
  public resetMap(map: Map<NodeId, boolean>): void {
    for (const key of map.keys()) map.set(key, false);
  }

  /**
   * 返回拓扑排序后的节点 ID 序列；结果会被缓存直到下次结构变更。
   *
   * @remarks
   * 当图含环时，环上的节点会按原始顺序追加在末尾。
   *
   * @returns 拓扑顺序的节点 ID 序列
   */
  public topology(): NodeId[] {
    return this.topologyWithCycle().order;
  }

  /**
   * 返回拓扑排序结果及环路信息。
   *
   * @remarks 结果会被缓存直到下次结构变更。
   *
   * @returns 包含排序结果与环路信息
   */
  public topologyWithCycle(): TopoSortResult {
    if (!this._dirty && this._topology !== null && this._cycleInfo !== null) {
      return { order: this._topology, cycleInfo: this._cycleInfo };
    }

    const { order, cycleInfo } = this._sort();
    this._topology = order;
    this._cycleInfo = cycleInfo;
    this._dirty = false;
    return { order, cycleInfo };
  }

  /**
   * Kahn 算法实现的拓扑排序，同时返回环路信息。
   *
   * @remarks
   * 与 `algorithms.ts` 的 `toposortFull` 共享相同算法，但本版本直接复用 {@link Adjacency}
   * 缓存的 `successors` 与 `inDegree`，省去重新遍历边的开销；处理队列时使用游标而非
   * `Array#shift`，将 O(N²) 降为 O(N + E)。
   *
   * @returns 排序结果与环路信息
   * @internal
   */
  private _sort(): TopoSortResult {
    const adj = this._adj();
    const inDegree = new Map<NodeId, number>(adj.inDegree);
    const order: NodeId[] = [];
    const queue: NodeId[] = [];

    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) queue.push(nodeId);
    }

    let head = 0;
    while (head < queue.length) {
      const nodeId = queue[head++]!;
      order.push(nodeId);
      const successors = adj.successors.get(nodeId);
      if (!successors) continue;
      for (const neighbor of successors) {
        const remaining = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, remaining);
        if (remaining === 0) queue.push(neighbor);
      }
    }

    // 没出队的节点必定在环上，按原始插入顺序追加。
    const cycleNodes: NodeId[] = [];
    if (order.length < this.nodes.size) {
      const visited = new Set<NodeId>(order);
      for (const nodeId of this.nodes.keys()) {
        if (!visited.has(nodeId)) cycleNodes.push(nodeId);
      }
      order.push(...cycleNodes);
    }

    return {
      order,
      cycleInfo: {
        hasCycle: cycleNodes.length > 0,
        cycleNodes,
      },
    };
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
   * 在目标输入端口上 `attach`/`detach` 一条边。
   *
   * @param edge 边
   * @param attach `true` 时关联，`false` 时解除
   * @internal
   */
  private _link(edge: Edge<E>, attach: boolean): void {
    const port = edge.target.port;
    if (port.direction !== 'input') return;
    const input = port as Input;
    if (attach) input.attach(edge.id);
    else input.detach(edge.id);
  }

  /**
   * 用引用相等检测端口是否在节点的端口字典中注册。
   *
   * @param ports 节点的端口字典
   * @param target 要检查的端口
   * @internal
   */
  private _owns(ports: PortDict, target: Port): boolean {
    for (const key in ports) {
      if (ports[key] === target) return true;
    }
    return false;
  }

  /**
   * 标记拓扑缓存失效。在任何结构变更后调用。
   *
   * @internal
   */
  private _invalidate(): void {
    this._dirty = true;
    this._topology = null;
    this._cycleInfo = null;
  }
}

/**
 * 将端口字典序列化为 `{ portName: { id, socket } | null }`。
 *
 * @internal
 */
function portDictToJson(
  ports: PortDict,
): Record<string, { id: PortId; socket: string } | null> {
  const result: Record<string, { id: PortId; socket: string } | null> = {};
  for (const [name, port] of Object.entries(ports)) {
    result[name] = port ? { id: port.id, socket: port.socket.name } : null;
  }
  return result;
}
