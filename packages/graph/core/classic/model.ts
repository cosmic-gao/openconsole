/**
 * Model：图的数据模型层 —— 储存 + CRUD + 基础 trait + 事件订阅（组合 {@link Signal}）。
 */

import { Signal } from '@opendesign/signal';

import type {
  EdgeId,
  Events,
  GraphId,
  Listener,
  NodeId,
  Sockets,
  Subscribable,
  Vertex,
} from '../types';
import { Edge } from './edge';
import { Endpoint } from './endpoint';
import type { Node } from './node';
import { Registry } from './registry';
import { validate } from './validate';

/**
 * 图模型层：储存 + CRUD + Catalog / NodeIndexable / Visitable trait + 事件订阅。
 *
 * @remarks 通过组合两个服务实例完成职责委派：
 * - {@link Registry}：节点 ID ↔ 稠密索引双向映射，承接 NodeIndexable trait；
 * - {@link Signal}：类型化事件总线，承接 Subscribable trait（{@link on} / {@link off} facade）。
 *
 * @template N 节点附带的数据载荷类型
 * @template E 边附带的数据载荷类型
 */
export class Model<N = unknown, E = unknown> implements Subscribable<N, E> {
  /** 节点存储：NodeId → Vertex。 */
  public readonly nodes = new Map<NodeId, Vertex<N>>();

  /** 边存储：EdgeId → Edge。 */
  public readonly edges = new Map<EdgeId, Edge<E>>();

  /** 稠密索引（组合）：维护节点 ID ↔ 索引的双向映射。 */
  private readonly _registry = new Registry();

  /** 事件总线（组合）：承载 {@link Events}。 */
  private readonly _signal = new Signal<Events<N, E>>();

  /** 自增计数器，用于 {@link connect} 无 ID 时生成默认边 ID。 */
  private _sequence = 0;

  /**
   * @param id 图的唯一标识
   */
  public constructor(public readonly id: GraphId) {}

  // #region 节点与边的 CRUD

  /**
   * 加入一个节点。
   *
   * @template I 节点的输入 Sockets 形态
   * @template O 节点的输出 Sockets 形态
   * @param node 待加入的节点
   * @returns 当前图实例（链式调用）
   * @throws {Error} 当同 ID 节点已存在时
   */
  public addNode<I extends Sockets, O extends Sockets>(node: Node<I, O, N>): this {
    if (this.nodes.has(node.id)) {
      throw this._error('addNode', `a node with id "${String(node.id)}" already exists.`);
    }
    const vertex = toVertex(node);
    this.nodes.set(node.id, vertex);
    this._registry.add(node.id);
    this._signal.emit('nodeAdded', { node: vertex });
    return this;
  }

  /**
   * 移除节点，并连带删除所有与该节点相关的边。
   *
   * @remarks 顺序：先发 `edgeRemoved`（每条相邻边一次），再发 `nodeRemoved`。
   *   节点不存在时静默返回 `undefined`，不抛错。
   *
   * @param nodeId 节点 ID
   * @returns 被移除的节点；不存在时返回 `undefined`
   */
  public removeNode(nodeId: NodeId): Vertex<N> | undefined {
    const node = this.nodes.get(nodeId);
    if (!node) return undefined;

    // 单次扫描 input + output 端口收集 incident 边（Set 去重自环）。
    const incident = new Set<EdgeId>();
    for (const key in node.inputs) {
      const port = node.inputs[key];
      if (port) for (const id of port.edges) incident.add(id);
    }
    for (const key in node.outputs) {
      const port = node.outputs[key];
      if (port) for (const id of port.edges) incident.add(id);
    }
    for (const edgeId of incident) {
      const edge = this.edges.get(edgeId);
      if (!edge) continue;
      // 仅 detach 留存节点上的端口；被删节点上的端口会随节点一起 GC。
      if (edge.sourceId !== nodeId) edge.source.port.detach(edge.id);
      if (edge.targetId !== nodeId) edge.target.port.detach(edge.id);
      this.edges.delete(edgeId);
      this._signal.emit('edgeRemoved', { edge });
    }

    this._registry.remove(nodeId);
    this.nodes.delete(nodeId);
    this._signal.emit('nodeRemoved', { node });
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
   * @returns 是否存在
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
   * @returns 是否存在
   */
  public hasEdge(edgeId: EdgeId): boolean {
    return this.edges.has(edgeId);
  }

  /**
   * 加入一条边，并把它登记到两端端口的 `edges` 列表里。
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
      throw this._error('addEdge', `an edge with id "${String(edge.id)}" already exists.`);
    }
    if (!this.nodes.has(edge.sourceId)) {
      throw this._error(
        `addEdge "${String(edge.id)}"`,
        `source node "${String(edge.sourceId)}" does not exist.`,
      );
    }
    if (!this.nodes.has(edge.targetId)) {
      throw this._error(
        `addEdge "${String(edge.id)}"`,
        `target node "${String(edge.targetId)}" does not exist.`,
      );
    }
    validate(this.id, edge, this.nodes);
    this.edges.set(edge.id, edge);
    edge.source.port.attach(edge.id);
    edge.target.port.attach(edge.id);
    this._signal.emit('edgeAdded', { edge });
    return this;
  }

  /**
   * 流式 API：按 `[节点ID, 端口名]` 元组连接两端，自动包装 Endpoint + Edge。
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
      throw this._error('connect', `source node "${String(sourceNodeId)}" not found.`);
    }
    const targetNode = this.nodes.get(targetNodeId);
    if (!targetNode) {
      throw this._error('connect', `target node "${String(targetNodeId)}" not found.`);
    }

    const sourcePort = sourceNode.outputs[sourcePortName];
    if (!sourcePort) {
      throw this._error(
        'connect',
        `output port "${sourcePortName}" not found on node "${String(sourceNodeId)}".`,
      );
    }
    const targetPort = targetNode.inputs[targetPortName];
    if (!targetPort) {
      throw this._error(
        'connect',
        `input port "${targetPortName}" not found on node "${String(targetNodeId)}".`,
      );
    }

    const edgeId = options?.id ?? this._allocate();
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
   * 移除一条边，并从两端端口的 `edges` 列表里 detach。
   *
   * @param edgeId 边 ID
   * @returns 被移除的边；不存在时返回 `undefined`
   */
  public removeEdge(edgeId: EdgeId): Edge<E> | undefined {
    const edge = this.edges.get(edgeId);
    if (!edge) return undefined;
    edge.source.port.detach(edge.id);
    edge.target.port.detach(edge.id);
    this.edges.delete(edgeId);
    this._signal.emit('edgeRemoved', { edge });
    return edge;
  }

  // #endregion

  // #region 杂项

  /**
   * 图是否为空（不含任何节点）。
   *
   * @returns 是否为空
   */
  public empty(): boolean {
    return this.nodes.size === 0;
  }

  /**
   * 清空所有节点与边。
   *
   * @remarks 不触发任何事件 —— 批量清空场景下事件风暴反而碍事。
   *   订阅者保留：clear 不取消用户订阅。
   */
  public clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this._registry.clear();
  }

  // #endregion

  // #region Catalog / NodeIndexable / Visitable trait 实现

  /**
   * {@inheritDoc Catalog.nodeIds}
   *
   * @remarks 每次 `for...of` 都会调用 `Symbol.iterator` 取新的 `Map.keys()` 迭代器，
   *   因此可重复使用；不会出现"迭代器耗尽"的副作用。
   */
  public readonly nodeIds: Iterable<NodeId> = {
    [Symbol.iterator]: () => this.nodes.keys(),
  };

  /**
   * {@inheritDoc Catalog.edgeIds}
   *
   * @remarks 同 {@link nodeIds}：每次 `for...of` 取一个新的内部迭代器。
   */
  public readonly edgeIds: Iterable<EdgeId> = {
    [Symbol.iterator]: () => this.edges.keys(),
  };

  /** {@inheritDoc Catalog.nodeCount} */
  public nodeCount(): number {
    return this.nodes.size;
  }

  /** {@inheritDoc Catalog.edgeCount} */
  public edgeCount(): number {
    return this.edges.size;
  }

  /** {@inheritDoc NodeIndexable.bound} (O(1)) */
  public bound(): number {
    return this._registry.bound();
  }

  /** {@inheritDoc NodeIndexable.at} (O(1)) */
  public at(index: number): NodeId | undefined {
    return this._registry.at(index);
  }

  /** {@inheritDoc NodeIndexable.indexOf} (O(1)) */
  public indexOf(nodeId: NodeId): number {
    return this._registry.indexOf(nodeId);
  }

  /** {@inheritDoc Visitable.marks} */
  public marks(): Map<NodeId, boolean> {
    const map = new Map<NodeId, boolean>();
    for (const id of this.nodes.keys()) map.set(id, false);
    return map;
  }

  /** {@inheritDoc Visitable.reset} */
  public reset(map: Map<NodeId, boolean>): void {
    for (const key of map.keys()) map.set(key, false);
  }

  // #endregion

  // #region 事件订阅（委托给 _signal）

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
  public on<K extends keyof Events>(
    event: K,
    listener: Listener<Events<N, E>[K]>,
  ): () => void {
    return this._signal.on(event, listener);
  }

  /**
   * 取消订阅指定回调。
   *
   * @template K 事件名
   * @param event 事件名
   * @param listener 之前传给 {@link on} 的回调
   */
  public off<K extends keyof Events>(
    event: K,
    listener: Listener<Events<N, E>[K]>,
  ): void {
    this._signal.off(event, listener);
  }

  // #endregion

  // #region 内部 helpers

  /**
   * 分配下一个可用边 ID（跳过已存在 ID 以避免冲突）。
   *
   * @internal
   */
  private _allocate(): EdgeId {
    let id: EdgeId;
    do {
      id = `e${this._sequence++}` as EdgeId;
    } while (this.edges.has(id));
    return id;
  }

  /**
   * 构造带图 ID 前缀的 Error；统一错误消息格式 `[Graph "<id>"] <op>: <msg>`。
   *
   * @remarks 保留 throw 在调用方原行号 —— 仅 `new Error(...)` 在此函数内，不影响 stack trace
   *   定位到具体的 throw 语句。
   *
   * @internal
   */
  private _error(op: string, msg: string): Error {
    return new Error(`[Graph "${String(this.id)}"] ${op}: ${msg}`);
  }

  // #endregion
}

/**
 * 把用户面 {@link Node}`<I, O, W>` 投影为图存储面 {@link Vertex}`<W>`。
 *
 * @remarks
 * 双层 `as unknown as` 是必要的类型擦除：`Node<I, O, N>` 与 `Node<Sockets, Sockets, N>`
 * 在 TS 中不直接 assignable —— `inputs: Inputs<I>` 是 mapped type，且 Node 内部有可变字段
 * （weight setter）使泛型保持 invariant。把 cast 集中到这个 helper 让调用方无须重复，并把
 * "这是有意的、安全的擦除"集中文档化。
 *
 * @internal
 */
function toVertex<I extends Sockets, O extends Sockets, N>(node: Node<I, O, N>): Vertex<N> {
  return node as unknown as Vertex<N>;
}
