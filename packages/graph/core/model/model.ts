import { Signal } from "@openconsole/signal";

import { attachedPort, EMPTY } from "../support";
import type {
  EdgeId,
  Events,
  GraphId,
  Hierarchy,
  Node,
  NodeId,
  Sockets,
  Subscribable,
} from "../types";
import { Edge } from "./edge";
import { Endpoint } from "./endpoint";
import { Attached, Cycle, Duplicate, Missing } from "./errors";
import { Registry, type Indexer } from "./registry";
import { validate } from "./validate";
import type { Vertex } from "./vertex";

/**
 * 图的存储与变更层：维护节点/边集合，提供 CRUD、权重更新、复合层级与事务批处理，并通过 {@link Model.signal} 派发变更事件。
 *
 * @typeParam N - 节点权重类型
 * @typeParam E - 边权重类型
 */
export class Model<N = unknown, E = unknown>
  implements Subscribable<N, E>, Hierarchy
{
  protected readonly _nodes = new Map<NodeId, Node<N>>();
  protected readonly _edges = new Map<EdgeId, Edge<E>>();
  private readonly _registry: Indexer;
  private readonly _parent = new Map<NodeId, NodeId>();
  private readonly _children = new Map<NodeId, Set<NodeId>>();

  /** 图变更事件源（节点/边的增删改）。 */
  public readonly signal = new Signal<Events<N, E>>();

  private _sequence = 0;
  private _depth = 0;
  private readonly _pending: Array<() => void> = [];

  public constructor(
    /** 图唯一 id。 */
    public readonly id: GraphId,
  ) {
    this._registry = this.createRegistry();
  }

  /**
   * 创建节点索引器。子类可覆盖以改变删除后的下标语义——默认 {@link Registry}（swap-and-pop，
   * 下标会移动），{@link StableGraph} 覆盖为 {@link StableRegistry}（下标稳定）。
   */
  protected createRegistry(): Indexer {
    return new Registry();
  }

  /**
   * 添加一个节点。图直接持有传入的 {@link Vertex} 实例（不复制），因此要求其端口未连边——
   * 否则同一实例会被两个图共享，端口边表互相污染。
   *
   * @throws {@link Duplicate} 节点 id 已存在
   * @throws {@link Attached} 节点的端口仍连着边（已属于其他图）
   */
  public addNode<I extends Sockets, O extends Sockets>(
    vertex: Vertex<I, O, N>,
  ): this {
    if (this._nodes.has(vertex.id)) throw new Duplicate("node", vertex.id);
    const node = toNode(vertex);
    const busy = attachedPort(node);
    if (busy) throw new Attached(busy.id, `node "${String(vertex.id)}"`);
    this._nodes.set(vertex.id, node);
    this._registry.add(vertex.id);
    this._fire(() => this.signal.emit("nodeAdded", { node }));
    return this;
  }

  /**
   * 合并节点：已存在则更新其权重，否则新增。
   *
   * @returns 新增返回 `true`，更新已有返回 `false`
   */
  public mergeNode<I extends Sockets, O extends Sockets>(
    vertex: Vertex<I, O, N>,
  ): boolean {
    if (this._nodes.has(vertex.id)) {
      this.setNodeWeight(vertex.id, vertex.weight);
      return false;
    }
    this.addNode(vertex);
    return true;
  }

  /**
   * 删除节点，并连带删除其所有关联边、解除层级关系。
   *
   * @returns 被删除的节点，不存在则返回 `undefined`
   */
  public dropNode(node: NodeId): Node<N> | undefined {
    const found = this._nodes.get(node);
    if (!found) return undefined;

    const incident = new Set<EdgeId>();
    for (const key in found.inputs) {
      const port = found.inputs[key];
      if (port) for (const id of port.edges) incident.add(id);
    }
    for (const key in found.outputs) {
      const port = found.outputs[key];
      if (port) for (const id of port.edges) incident.add(id);
    }
    for (const id of incident) {
      const edge = this._edges.get(id);
      if (!edge) continue;
      // 两端都解除（含被删节点自身），避免其端口残留已失效的边 id。
      edge.source.port.detach(edge.id);
      edge.target.port.detach(edge.id);
      this._edges.delete(id);
      this._fire(() => this.signal.emit("edgeDropped", { edge }));
    }

    this._detachHierarchy(node);
    this._registry.remove(node);
    this._nodes.delete(node);
    this._fire(() => this.signal.emit("nodeDropped", { node: found }));
    return found;
  }

  /** 按 id 获取节点，不存在返回 `undefined`。 */
  public node(node: NodeId): Node<N> | undefined {
    return this._nodes.get(node);
  }

  /** 是否存在指定节点。 */
  public hasNode(node: NodeId): boolean {
    return this._nodes.has(node);
  }

  /**
   * 设置节点权重并派发更新事件。
   *
   * @throws {@link Missing} 节点不存在
   */
  public setNodeWeight(node: NodeId, weight: N | undefined): this {
    return this.updateNode(node, () => weight);
  }

  /**
   * 以函数方式更新节点权重并派发更新事件。
   *
   * @throws {@link Missing} 节点不存在
   */
  public updateNode(
    node: NodeId,
    updater: (weight: N | undefined) => N | undefined,
  ): this {
    const found = this._nodes.get(node);
    if (!found) throw new Missing("node", node);
    const before = found.weight;
    const after = updater(before);
    found.weight = after;
    this._fire(() =>
      this.signal.emit("nodeUpdated", { node: found, before, after }),
    );
    return this;
  }

  /**
   * 添加一条边（先经 {@link validate} 校验合法性）。
   *
   * @throws {@link Duplicate} 边 id 已存在
   * @throws {@link Missing} 端点节点不存在
   */
  public addEdge(edge: Edge<E>): this {
    if (this._edges.has(edge.id)) throw new Duplicate("edge", edge.id);
    if (!this._nodes.has(edge.sourceId))
      throw new Missing("node", edge.sourceId);
    if (!this._nodes.has(edge.targetId))
      throw new Missing("node", edge.targetId);
    validate(edge, this._nodes);
    this._edges.set(edge.id, edge);
    edge.source.port.attach(edge.id);
    edge.target.port.attach(edge.id);
    this._fire(() => this.signal.emit("edgeAdded", { edge }));
    return this;
  }

  /**
   * 按 `[节点, 端口名]` 在源输出端口与目标输入端口间创建并添加一条边。
   *
   * @param from - 源 `[节点 id, 输出端口名]`
   * @param to - 目标 `[节点 id, 输入端口名]`
   * @returns 新建的边
   * @throws {@link Missing} 节点或端口不存在
   */
  public connect(
    from: readonly [NodeId, string],
    to: readonly [NodeId, string],
    options?: { id?: EdgeId; weight?: E },
  ): Edge<E> {
    const [sourceNode, sourcePortName] = from;
    const [targetNode, targetPortName] = to;

    const source = this._nodes.get(sourceNode);
    if (!source) throw new Missing("node", sourceNode, "connect source");
    const target = this._nodes.get(targetNode);
    if (!target) throw new Missing("node", targetNode, "connect target");

    const sourcePort = source.outputs[sourcePortName];
    if (!sourcePort) {
      throw new Missing(
        "port",
        `${String(sourceNode)}:${sourcePortName}` as never,
        "connect source output",
      );
    }
    const targetPort = target.inputs[targetPortName];
    if (!targetPort) {
      throw new Missing(
        "port",
        `${String(targetNode)}:${targetPortName}` as never,
        "connect target input",
      );
    }

    const id = options?.id ?? this._allocate();
    const edge = new Edge<E>(
      id,
      new Endpoint(source, sourcePort),
      new Endpoint(target, targetPort),
      options?.weight,
    );
    this.addEdge(edge);
    return edge;
  }

  /**
   * 删除一条边并从两端端口解除连接。
   *
   * @returns 被删除的边，不存在则返回 `undefined`
   */
  public dropEdge(edge: EdgeId): Edge<E> | undefined {
    const found = this._edges.get(edge);
    if (!found) return undefined;
    found.source.port.detach(found.id);
    found.target.port.detach(found.id);
    this._edges.delete(edge);
    this._fire(() => this.signal.emit("edgeDropped", { edge: found }));
    return found;
  }

  /** 按 id 获取边，不存在返回 `undefined`。 */
  public edge(edge: EdgeId): Edge<E> | undefined {
    return this._edges.get(edge);
  }

  /** 是否存在指定边。 */
  public hasEdge(edge: EdgeId): boolean {
    return this._edges.has(edge);
  }

  /**
   * 设置边权重并派发更新事件。
   *
   * @throws {@link Missing} 边不存在
   */
  public setEdgeWeight(edge: EdgeId, weight: E | undefined): this {
    return this.updateEdge(edge, () => weight);
  }

  /**
   * 以函数方式更新边权重并派发更新事件。
   *
   * @throws {@link Missing} 边不存在
   */
  public updateEdge(
    edge: EdgeId,
    updater: (weight: E | undefined) => E | undefined,
  ): this {
    const found = this._edges.get(edge);
    if (!found) throw new Missing("edge", edge);
    const before = found.weight;
    const after = updater(before);
    found.weight = after;
    this._fire(() =>
      this.signal.emit("edgeUpdated", { edge: found, before, after }),
    );
    return this;
  }

  /**
   * 为节点设置父节点以构建复合层级（会先解除原有父子关系）。
   *
   * @throws {@link Missing} 节点或父节点不存在
   * @throws {@link Cycle} 会形成层级环
   */
  public setParent(node: NodeId, parent: NodeId): this {
    if (!this._nodes.has(node))
      throw new Missing("node", node, "setParent child");
    if (!this._nodes.has(parent))
      throw new Missing("node", parent, "setParent parent");
    if (node === parent) throw new Cycle([node]);
    for (
      let cursor: NodeId | undefined = parent;
      cursor !== undefined;
      cursor = this._parent.get(cursor)
    ) {
      if (cursor === node) throw new Cycle([node, parent]);
    }
    this._detachParent(node);
    this._parent.set(node, parent);
    let kids = this._children.get(parent);
    if (!kids) {
      kids = new Set();
      this._children.set(parent, kids);
    }
    kids.add(node);
    return this;
  }

  /** 获取节点的父节点，无父节点返回 `undefined`。 */
  public parent(node: NodeId): NodeId | undefined {
    return this._parent.get(node);
  }

  /** 获取节点的直接子节点（惰性迭代）。 */
  public children(node: NodeId): Iterable<NodeId> {
    const kids = this._children.get(node);
    return kids ? { [Symbol.iterator]: () => kids.values() } : EMPTY;
  }

  /** 解除节点与其父节点的关系。 */
  public unparent(node: NodeId): this {
    this._detachParent(node);
    return this;
  }

  /**
   * 在事务中执行 `work`：期间产生的变更事件会缓冲，待最外层事务结束后统一派发（即使抛错也会派发已积累的事件）。
   *
   * @returns `work` 的返回值
   */
  public batch<T>(work: () => T): T {
    this._depth++;
    let result: T;
    try {
      result = work();
    } catch (error) {
      this._depth--;
      if (this._depth === 0) this._drain();
      throw error;
    }
    this._depth--;
    if (this._depth === 0) this._drain();
    return result;
  }

  /**
   * 清空整个图：节点、边、层级关系全部移除。
   * 走 {@link Model.dropNode} 逐个删除，因此会派发完整的 dropped 事件（合并在一个事务里），
   * 订阅者（如 IncrementalTopo）不会与图失同步。
   */
  public clear(): void {
    this.batch(() => {
      for (const node of [...this._nodes.keys()]) this.dropNode(node);
    });
    this._nodes.clear();
    this._edges.clear();
    this._registry.clear();
    this._parent.clear();
    this._children.clear();
  }

  /** 仅清空所有边，保留节点；同样派发 edgeDropped 事件。 */
  public clearEdges(): void {
    this.batch(() => {
      for (const edge of [...this._edges.keys()]) this.dropEdge(edge);
    });
  }

  /** 节点数量（图的阶）。 */
  public get order(): number {
    return this._nodes.size;
  }

  /** 边数量（图的规模）。 */
  public get size(): number {
    return this._edges.size;
  }

  /** 遍历所有节点 id（惰性）。 */
  public nodes(): Iterable<NodeId> {
    const nodes = this._nodes;
    return { [Symbol.iterator]: () => nodes.keys() };
  }

  /** 遍历所有边 id（惰性）。 */
  public edges(): Iterable<EdgeId> {
    const edges = this._edges;
    return { [Symbol.iterator]: () => edges.keys() };
  }

  /** 节点下标上界（用于矩阵类算法）。 */
  public bound(): number {
    return this._registry.bound();
  }

  /** 按下标取节点 id，越界返回 `undefined`。 */
  public at(index: number): NodeId | undefined {
    return this._registry.at(index);
  }

  /** 取节点下标，未登记返回 `-1`。 */
  public indexOf(node: NodeId): number {
    return this._registry.indexOf(node);
  }

  private _fire(emit: () => void): void {
    if (this._depth > 0) this._pending.push(emit);
    else emit();
  }

  private _drain(): void {
    if (this._pending.length === 0) return;
    const queue = this._pending.splice(0, this._pending.length);
    for (const emit of queue) emit();
  }

  private _detachParent(node: NodeId): void {
    const old = this._parent.get(node);
    if (old === undefined) return;
    this._parent.delete(node);
    const kids = this._children.get(old);
    if (kids) {
      kids.delete(node);
      if (kids.size === 0) this._children.delete(old);
    }
  }

  private _detachHierarchy(node: NodeId): void {
    const grand = this._parent.get(node);
    const kids = this._children.get(node);
    if (kids) {
      for (const child of kids) {
        if (grand === undefined) {
          this._parent.delete(child);
        } else {
          this._parent.set(child, grand);
          let set = this._children.get(grand);
          if (!set) {
            set = new Set();
            this._children.set(grand, set);
          }
          set.add(child);
        }
      }
      this._children.delete(node);
    }
    this._detachParent(node);
  }

  private _allocate(): EdgeId {
    let id: EdgeId;
    do {
      id = `e${this._sequence++}` as EdgeId;
    } while (this._edges.has(id));
    return id;
  }
}

function toNode<I extends Sockets, O extends Sockets, N>(
  vertex: Vertex<I, O, N>,
): Node<N> {
  return vertex as unknown as Node<N>;
}
