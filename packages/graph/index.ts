declare const __brand: unique symbol;

/**
 * 在结构类型基础上叠加品牌标记，制造名义类型 (nominal typing)。
 *
 * @template T 底层值类型
 * @template B 品牌字符串字面量
 */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** 节点的唯一标识。 */
export type NodeId = Brand<string, 'NodeId'>;

/** 边的唯一标识。 */
export type EdgeId = Brand<string, 'EdgeId'>;

/** 端口的唯一标识。 */
export type PortId = Brand<string, 'PortId'>;

/** 图的唯一标识。 */
export type GraphId = Brand<string, 'GraphId'>;

/**
 * 方向：`'input'` 或 `'output'`。
 *
 * 同时用于：
 * - 端口的方向（输入端口 / 输出端口）；
 * - 边相对某个节点的方向（流入方为 `'input'`，流出方为 `'output'`）。
 */
export type Direction = 'input' | 'output';

/** 节点端口名 → Socket 的映射，用于声明节点的输入/输出形态。 */
export type Sockets = { readonly [key: string]: Socket };

/** 由 {@link Sockets} 推导出的输入端口字典类型。 */
export type Inputs<I extends Sockets> = { [K in keyof I]?: Input<I[K]> };

/** 由 {@link Sockets} 推导出的输出端口字典类型。 */
export type Outputs<O extends Sockets> = { [K in keyof O]?: Output<O[K]> };

/**
 * Socket 描述端口承载的数据类型，用于校验边连接的兼容性。
 *
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
   */
  public static from<T extends string>(name: T, compatible?: ReadonlyArray<Socket>): Socket<T> {
    return new Socket(name, compatible);
  }

  /**
   * 判断当前 Socket 是否与另一个 Socket 兼容。
   *
   * 兼容规则：
   * 1. 任一方为 `'*'` (any) 时兼容；
   * 2. 名称相同时兼容；
   * 3. 名称在 {@link compatible} 列表中时兼容。
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
  ) { }
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
    const portId = id ?? `${String(this.id)}:input:${name}` as PortId;
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
    const portId = id ?? `${String(this.id)}:output:${name}` as PortId;
    const port = new Output<O[K]>(socket, portId);
    this.outputs[name] = port;
    return port;
  }

  /**
   * 移除指定输入端口。
   *
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
   * @returns 是否成功移除（端口原本存在则返回 `true`）
   */
  public removeOutput(name: string & keyof O): boolean {
    if (!(name in this.outputs)) return false;
    delete this.outputs[name];
    return true;
  }

  /** 是否已声明指定名称的输入端口。 */
  public hasInput(name: string & keyof I): boolean {
    return name in this.inputs;
  }

  /** 是否已声明指定名称的输出端口。 */
  public hasOutput(name: string & keyof O): boolean {
    return name in this.outputs;
  }

  /**
   * 按名称获取输入端口。
   *
   * @template K 端口名
   * @returns 端口实例；未声明时返回 `undefined`
   */
  public input<K extends string & keyof I>(name: K): Input<I[K]> | undefined {
    return this.inputs[name] as Input<I[K]> | undefined;
  }

  /**
   * 按名称获取输出端口。
   *
   * @template K 端口名
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
export class Endpoint<
  N extends Node = Node,
  P extends Port = Port,
> {
  /**
   * @param node 端点所在的节点
   * @param port 端点对应的端口
   */
  public constructor(
    public readonly node: N,
    public readonly port: P,
  ) { }

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

  /** 本条边是否与给定节点相关（作为起点或终点）。 */
  public connects(nodeId: NodeId): boolean {
    return this.source.nodeId === nodeId || this.target.nodeId === nodeId;
  }

  /**
   * 给定方向，返回另一端的节点 ID。
   *
   * @param direction `'input'` 视角（从终点看）返回起点；`'output'` 视角（从起点看）返回终点
   */
  public opposite(direction: Direction): NodeId {
    return direction === 'input' ? this.source.nodeId : this.target.nodeId;
  }
}

/**
 * Graph 内部存储节点时使用的擦除态类型。
 *
 * 节点本身可保留具体的输入/输出 Sockets 形态，但图本身不约束这些形态，因此在
 * 存储层将其退化为 {@link Sockets}。
 *
 * @template W 节点数据载荷类型
 */
export type StoredNode<W> = Node<Sockets, Sockets, W>;

/**
 * 有向图，承载节点 (`Node`) 与边 (`Edge`)，并提供拓扑排序、邻接查询等基础算法。
 *
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

  /** 拓扑缓存是否过期。 */
  private _dirty = true;

  /** 拓扑排序结果缓存；`null` 表示尚未计算或已失效。 */
  private _topology: NodeId[] | null = null;

  /**
   * @param id 图的唯一标识
   */
  public constructor(public readonly id: GraphId) { }

  /**
   * 加入一个节点。
   *
   * @template I 节点的输入 Sockets 形态
   * @template O 节点的输出 Sockets 形态
   * @throws {Error} 当同 ID 节点已存在时抛出
   */
  public addNode<I extends Sockets, O extends Sockets>(
    node: Node<I, O, N>,
  ): this {
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
   * @returns 被移除的节点；不存在时返回 `undefined`
   */
  public removeNode(nodeId: NodeId): StoredNode<N> | undefined {
    const node = this.nodes.get(nodeId);
    if (!node) return undefined;
    this._prune(nodeId);
    this.nodes.delete(nodeId);
    this._invalidate();
    return node;
  }

  /** 按 ID 获取节点；不存在返回 `undefined`。 */
  public getNode(nodeId: NodeId): StoredNode<N> | undefined {
    return this.nodes.get(nodeId);
  }

  /** 是否存在指定 ID 的节点。 */
  public hasNode(nodeId: NodeId): boolean {
    return this.nodes.has(nodeId);
  }

  /** 遍历所有节点。 */
  public getNodes(): IterableIterator<StoredNode<N>> {
    return this.nodes.values();
  }

  /** 按 ID 获取边；不存在返回 `undefined`。 */
  public getEdge(edgeId: EdgeId): Edge<E> | undefined {
    return this.edges.get(edgeId);
  }

  /** 是否存在指定 ID 的边。 */
  public hasEdge(edgeId: EdgeId): boolean {
    return this.edges.has(edgeId);
  }

  /** 遍历所有边。 */
  public getEdges(): IterableIterator<Edge<E>> {
    return this.edges.values();
  }

  /**
   * 加入一条边，并将其登记到目标输入端口的连接列表中。
   *
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
    return this;
  }

  /**
   * 移除一条边，并将其从目标输入端口的连接列表中解除。
   *
   * @returns 被移除的边；不存在时返回 `undefined`
   */
  public removeEdge(edgeId: EdgeId): Edge<E> | undefined {
    const edge = this.edges.get(edgeId);
    if (!edge) return undefined;
    this._link(edge, false);
    this.edges.delete(edgeId);
    this._invalidate();
    return edge;
  }

  /** 流入指定节点的所有边。 */
  public incomingEdges(nodeId: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this.edges.values()) {
      if (edge.targetId === nodeId) result.push(edge);
    }
    return result;
  }

  /** 流出指定节点的所有边。 */
  public outgoingEdges(nodeId: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this.edges.values()) {
      if (edge.sourceId === nodeId) result.push(edge);
    }
    return result;
  }

  /** 与指定节点关联的所有边（流入 + 流出）。 */
  public incidentEdges(nodeId: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this.edges.values()) {
      if (edge.connects(nodeId)) result.push(edge);
    }
    return result;
  }

  /** 从 `source` 直接指向 `target` 的所有有向边。 */
  public edgesBetween(source: NodeId, target: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this.edges.values()) {
      if (edge.sourceId === source && edge.targetId === target) result.push(edge);
    }
    return result;
  }

  /** 连接 `left` 与 `right` 的所有边（不区分方向）。 */
  public edgesConnecting(left: NodeId, right: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this.edges.values()) {
      const matches =
        (edge.sourceId === left && edge.targetId === right) ||
        (edge.sourceId === right && edge.targetId === left);
      if (matches) result.push(edge);
    }
    return result;
  }

  /** 指定节点的前驱节点（直接指向它的节点）。 */
  public predecessors(nodeId: NodeId): NodeId[] {
    return this.incomingEdges(nodeId).map(edge => edge.sourceId);
  }

  /** 指定节点的后继节点（被它直接指向的节点）。 */
  public successors(nodeId: NodeId): NodeId[] {
    return this.outgoingEdges(nodeId).map(edge => edge.targetId);
  }

  /** 指定节点的所有邻居（前驱 + 后继）。 */
  public adjacencies(nodeId: NodeId): NodeId[] {
    return [...this.predecessors(nodeId), ...this.successors(nodeId)];
  }

  /** 入度：流入指定节点的边数。 */
  public inDegree(nodeId: NodeId): number {
    let count = 0;
    for (const edge of this.edges.values()) {
      if (edge.targetId === nodeId) count++;
    }
    return count;
  }

  /** 出度：流出指定节点的边数。 */
  public outDegree(nodeId: NodeId): number {
    let count = 0;
    for (const edge of this.edges.values()) {
      if (edge.sourceId === nodeId) count++;
    }
    return count;
  }

  /** 总度数：入度 + 出度。 */
  public degree(nodeId: NodeId): number {
    return this.inDegree(nodeId) + this.outDegree(nodeId);
  }

  /** 源节点：入度为 0 的节点。 */
  public sources(): StoredNode<N>[] {
    const result: StoredNode<N>[] = [];
    for (const node of this.nodes.values()) {
      if (this.inDegree(node.id) === 0) result.push(node);
    }
    return result;
  }

  /** 汇节点：出度为 0 的节点。 */
  public sinks(): StoredNode<N>[] {
    const result: StoredNode<N>[] = [];
    for (const node of this.nodes.values()) {
      if (this.outDegree(node.id) === 0) result.push(node);
    }
    return result;
  }

  /** 孤立节点：入度与出度均为 0 的节点。 */
  public isolated(): StoredNode<N>[] {
    const result: StoredNode<N>[] = [];
    for (const node of this.nodes.values()) {
      if (this.degree(node.id) === 0) result.push(node);
    }
    return result;
  }

  /** 是否存在从 `source` 直接到 `target` 的边。 */
  public adjacent(source: NodeId, target: NodeId): boolean {
    for (const edge of this.edges.values()) {
      if (edge.sourceId === source && edge.targetId === target) return true;
    }
    return false;
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
  }

  /** 序列化为可用 `JSON.stringify` 输出的纯对象快照。 */
  public toJson(): object {
    return {
      id: this.id,
      nodes: Array.from(this.nodes.values()).map(node => ({
        id: node.id,
        weight: node.weight,
        inputs: Object.fromEntries(
          Object.entries(node.inputs).map(([name, port]) => [
            name,
            port ? { id: port.id, socket: port.socket.name } : null,
          ]),
        ),
        outputs: Object.fromEntries(
          Object.entries(node.outputs).map(([name, port]) => [
            name,
            port ? { id: port.id, socket: port.socket.name } : null,
          ]),
        ),
      })),
      edges: Array.from(this.edges.values()).map(edge => ({
        id: edge.id,
        source: { nodeId: edge.source.nodeId, portId: edge.source.portId },
        target: { nodeId: edge.target.nodeId, portId: edge.target.portId },
        weight: edge.weight,
      })),
    };
  }

  /**
   * 返回拓扑排序后的节点 ID 序列；结果会被缓存直到下次结构变更。
   *
   * 当图含环时，环上的节点会按原始顺序追加在末尾。
   */
  public topology(): NodeId[] {
    if (!this._dirty && this._topology !== null) return this._topology;
    this._topology = this._sort();
    this._dirty = false;
    return this._topology;
  }

  /**
   * Kahn 算法实现的拓扑排序。
   *
   * @internal
   */
  private _sort(): NodeId[] {
    const visited = new Set<NodeId>();
    const order: NodeId[] = [];
    const inDegree = new Map<NodeId, number>();
    const adjacency = new Map<NodeId, NodeId[]>();

    for (const nodeId of this.nodes.keys()) {
      inDegree.set(nodeId, 0);
      adjacency.set(nodeId, []);
    }

    for (const edge of this.edges.values()) {
      adjacency.get(edge.sourceId)?.push(edge.targetId);
      inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) + 1);
    }

    const queue: NodeId[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) queue.push(nodeId);
    }

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      order.push(nodeId);
      visited.add(nodeId);

      for (const neighbor of adjacency.get(nodeId) ?? []) {
        const remaining = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, remaining);
        if (remaining === 0) queue.push(neighbor);
      }
    }

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) order.push(nodeId);
    }

    return order;
  }

  /**
   * 校验边的端口是否存在、方向是否正确、Socket 是否兼容；不通过时抛出带上下文的错误。
   *
   * @throws {Error} 当端口缺失、方向错误或 Socket 不兼容
   * @internal
   */
  private _validate(edge: Edge<E>): void {
    const sourceOutput = Object.values(edge.source.node.outputs)
      .find((port): port is Output => !!port && port.id === edge.source.portId);
    if (!sourceOutput) {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": source port "${String(edge.source.portId)}" not found on node "${String(edge.source.nodeId)}".`,
      );
    }

    const targetInput = Object.values(edge.target.node.inputs)
      .find((port): port is Input => !!port && port.id === edge.target.portId);
    if (!targetInput) {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": target port "${String(edge.target.portId)}" not found on node "${String(edge.target.nodeId)}".`,
      );
    }

    if (sourceOutput.direction !== 'output') {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": source endpoint port "${String(sourceOutput.id)}" must be an output port (got direction="${sourceOutput.direction}").`,
      );
    }

    if (targetInput.direction !== 'input') {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": target endpoint port "${String(targetInput.id)}" must be an input port (got direction="${targetInput.direction}").`,
      );
    }

    if (!sourceOutput.socket.matches(targetInput.socket)) {
      throw new Error(
        `[Graph "${String(this.id)}"] addEdge "${String(edge.id)}": socket type "${sourceOutput.socket.name}" (source) is incompatible with "${targetInput.socket.name}" (target).`,
      );
    }
  }

  /**
   * 在目标输入端口上 `attach`/`detach` 一条边。
   *
   * @param attach `true` 时关联，`false` 时解除
   * @internal
   */
  private _link(edge: Edge<E>, attach: boolean): void {
    const targetNode = this.nodes.get(edge.targetId);
    if (!targetNode) return;
    const input = Object.values(targetNode.inputs)
      .find((port): port is Input => !!port && port.id === edge.target.portId);
    if (!input) return;
    if (attach) input.attach(edge.id);
    else input.detach(edge.id);
  }

  /**
   * 删除与指定节点相关的所有边（用于节点移除前的清理）。
   *
   * @internal
   */
  private _prune(nodeId: NodeId): void {
    const incidentIds: EdgeId[] = [];
    for (const edge of this.edges.values()) {
      if (edge.connects(nodeId)) incidentIds.push(edge.id);
    }
    for (const edgeId of incidentIds) this.removeEdge(edgeId);
  }

  /**
   * 标记拓扑缓存失效。在任何结构变更后调用。
   *
   * @internal
   */
  private _invalidate(): void {
    this._dirty = true;
    this._topology = null;
  }
}
