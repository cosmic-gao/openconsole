import { Signal } from "@openconsole/signal";

import { Capacity, Duplicate, Mismatch, Missing, Nested } from "./error";
import type { Events } from "./event";
import { edgeId, type EdgeId, type GraphId, type NodeId } from "./ident";
import { gather, Slots } from "./slots";
import type { Ports } from "./vertex";

const NONE = -1;

/** 加入图所需的节点描述。{@link Vertex} 与 {@link NodeRecord} 都满足它，故可直接互相搬运。 */
export interface NodeSpec<W = unknown> {
  readonly id: NodeId;
  readonly weight?: W | undefined;
  readonly inputs?: Ports | undefined;
  readonly outputs?: Ports | undefined;
}

export interface NodeRecord<W = unknown> {
  readonly id: NodeId;
  readonly weight: W | undefined;
  readonly inputs: Ports;
  readonly outputs: Ports;
}

export interface EdgeRecord<W = unknown> {
  readonly id: EdgeId;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly sourcePort: string;
  readonly targetPort: string;
  readonly weight: W | undefined;
}

/** `[节点, 端口名]`，用于定位边的一端。 */
export type Anchor = readonly [NodeId, string];

export interface ConnectOptions<E> {
  id?: EdgeId | undefined;
  weight?: E | undefined;
}

/**
 * 有向图：节点与边都以整数索引寻址，属性存放在平行数组里，邻接是纯数组读取。
 *
 * 删除只在索引位上留空并进入自由表，已发出的索引永不改指；空位由 {@link Graph.compact}
 * 显式回收（回收会派发 `compacted`，带旧→新索引映射）。算法不直接吃 `Graph`，
 * 而是吃它编译出的 {@link Snapshot}。
 *
 * @remarks 各 `forEach*` 遍历期间修改图（增删节点或边）的行为未定义——先把要改的
 *   收集出来再动手，事件订阅者不受此限（事件在变更完成后的事务边界派发）。
 */
export class Graph<N = unknown, E = unknown> {
  /**
   * 变更事件总线。
   *
   * @remarks 装了 `rescue`：某个 handler 抛错时**其余 handler 与其余事件照常派发**，
   *   错误收集起来、本轮派发完再上抛（多个错误聚合为 `AggregateError`）。少了这层隔离，
   *   一个坏订阅者会连带掐掉同一事务里其他订阅者的事件——那些事件已从队列里摘走，
   *   补不回来，按索引维护增量状态的订阅者（{@link Ordering}、布局缓存）从此静默错位。
   */
  public readonly signal = new Signal<Events<N, E>>({
    rescue: (error) => {
      this._failures.push(error);
    },
  });

  private readonly _nodes = new Slots<NodeId>();
  private readonly _weight: Array<N | undefined> = [];
  private readonly _inputs: Ports[] = [];
  private readonly _outputs: Ports[] = [];
  private readonly _out: number[][] = [];
  private readonly _in: number[][] = [];
  private readonly _parent: number[] = [];
  private readonly _children: Array<number[] | undefined> = [];

  private readonly _edges = new Slots<EdgeId>();
  private readonly _from: number[] = [];
  private readonly _to: number[] = [];
  private readonly _fromPort: string[] = [];
  private readonly _toPort: string[] = [];
  private readonly _edgeWeight: Array<E | undefined> = [];
  /** 边在两端邻接表里的下标，摘链时同步维护，见 {@link unhook}。 */
  private readonly _outAt: number[] = [];
  private readonly _inAt: number[] = [];
  /** 节点在父节点子表里的下标，语义同 {@link Graph._outAt}。 */
  private readonly _childAt: number[] = [];

  private _revision = 0;
  private _shape = 0;
  private _sequence = 0;
  private _depth = 0;
  private _changes = 0;
  private _settling = false;
  /** 本轮派发里各 handler 抛出的错误，见 {@link Graph.signal}。 */
  private readonly _failures: unknown[] = [];
  /** 待派发事件，`[类型, 载荷, 类型, 载荷, ...]` 交错存放，免去每条事件一个闭包。 */
  private readonly _queue: unknown[] = [];

  public constructor(public readonly id: GraphId) {}

  /** 任意变更（结构或权重）都会推进；{@link Snapshot} 据此判断自己是否已过期。 */
  public get revision(): number {
    return this._revision;
  }

  /**
   * 只有结构变更（增删节点与边、改端口、改层级、`compact`）才推进；改权重不动它。
   * {@link Snapshot.of} 据此决定能否复用上一份快照的 CSR。
   */
  public get shape(): number {
    return this._shape;
  }

  public get order(): number {
    return this._nodes.size;
  }

  public get size(): number {
    return this._edges.size;
  }

  /** 节点索引上界，含空位。 */
  public get bound(): number {
    return this._nodes.bound;
  }

  public indexOf(node: NodeId): number {
    return this._nodes.indexOf(node);
  }

  public at(index: number): NodeId | undefined {
    return this._nodes.at(index);
  }

  /** 边 id → 边槽位；不存在返回 -1。 */
  public edgeIndexOf(edge: EdgeId): number {
    return this._edges.indexOf(edge);
  }

  public edgeIdAt(index: number): EdgeId | undefined {
    return this._edges.at(index);
  }

  public nodes(): NodeId[] {
    return [...this._nodes.keys()];
  }

  public edges(): EdgeId[] {
    return [...this._edges.keys()];
  }

  public hasNode(node: NodeId): boolean {
    return this._nodes.has(node);
  }

  public hasEdge(edge: EdgeId): boolean {
    return this._edges.has(edge);
  }

  /** @throws {@link Duplicate} 节点 id 已存在 */
  public addNode(spec: NodeSpec<N>): NodeId {
    if (this._nodes.has(spec.id)) throw new Duplicate("node", spec.id);
    const u = this._nodes.add(spec.id);
    this._weight[u] = spec.weight;
    this._inputs[u] = { ...spec.inputs };
    this._outputs[u] = { ...spec.outputs };
    this._out[u] = [];
    this._in[u] = [];
    this._parent[u] = NONE;
    this._children[u] = undefined;
    this._childAt[u] = NONE;
    if (this._wants("nodeAdded", true)) {
      this._queue.push("nodeAdded", { node: spec.id, slot: u });
    }
    this._commit();
    return spec.id;
  }

  /** 已存在则只更新权重并返回 `false`，否则新增并返回 `true`。 */
  public mergeNode(spec: NodeSpec<N>): boolean {
    if (!this._nodes.has(spec.id)) {
      this.addNode(spec);
      return true;
    }
    this.setWeight(spec.id, spec.weight);
    return false;
  }

  /** 级联删除关联边，并把子节点提升到被删节点的父层。 */
  public dropNode(node: NodeId): boolean {
    const u = this._nodes.indexOf(node);
    if (u < 0) return false;
    this._drop(u, node);
    return true;
  }

  /** 按槽位删节点，{@link Graph.dropNode} 与 {@link Graph.clear} 共用。 */
  private _drop(u: number, node: NodeId): void {
    this.batch(() => {
      // 自环同时挂在两侧；去重后每条边只摘一次。
      const doomed = new Set<number>(this._out[u]!);
      for (const e of this._in[u]!) doomed.add(e);
      for (const e of doomed) this._sever(e);

      // 先摘掉子表：整表随节点一起丢弃，`_detach` 因此不会在**正被迭代的数组**上做
      // swap-pop——那样会把补位到已访问下标的子节点整个漏掉。
      const grand = this._parent[u]!;
      const children = this._children[u];
      this._children[u] = undefined;
      if (children) {
        for (const child of children) this._reparent(child, grand);
      }
      this._detach(u);

      const weight = this._weight[u];
      this._weight[u] = undefined;
      this._inputs[u] = {};
      this._outputs[u] = {};
      this._nodes.remove(node);
      if (this._wants("nodeDropped", true)) {
        this._queue.push("nodeDropped", { node, slot: u, weight });
      }
    });
  }

  /**
   * @remarks 返回记录里的 `inputs` / `outputs` 与图共享（零拷贝），类型上只读；
   *   绕过类型去改写它属于未定义行为——要换端口走 {@link Graph.reshape}。
   */
  public node(node: NodeId): NodeRecord<N> | undefined {
    const u = this._nodes.indexOf(node);
    if (u < 0) return undefined;
    return {
      id: node,
      weight: this._weight[u],
      inputs: this._inputs[u]!,
      outputs: this._outputs[u]!,
    };
  }

  /** 按槽位取节点记录，跳过 id 查表；空位返回 `undefined`。端口共享语义见 {@link Graph.node}。 */
  public nodeAt(slot: number): NodeRecord<N> | undefined {
    const id = this._nodes.at(slot);
    if (id === undefined) return undefined;
    return {
      id,
      weight: this._weight[slot],
      inputs: this._inputs[slot]!,
      outputs: this._outputs[slot]!,
    };
  }

  /**
   * 替换节点的端口集合，尽量保住现有连线。省略的一侧保持不变。
   *
   * 三类边会被断开并派发 `edgeDropped`：端口消失、Socket 不再兼容、超出新的单连接容量
   * （保留其中一条，删边用 swap-pop 打乱过内部次序，不保证是最早建立的那条）。
   * 断边而不是抛错，因为这是编辑器动作——上层靠事件决定是否提示与撤销。
   *
   * @throws {@link Missing} 节点不存在
   */
  public reshape(
    node: NodeId,
    ports: Pick<NodeSpec, "inputs" | "outputs">,
  ): this {
    const u = this._nodes.indexOf(node);
    if (u < 0) throw new Missing("node", node, "reshape");

    const inputs =
      ports.inputs === undefined ? this._inputs[u]! : { ...ports.inputs };
    const outputs =
      ports.outputs === undefined ? this._outputs[u]! : { ...ports.outputs };
    this._inputs[u] = inputs;
    this._outputs[u] = outputs;

    // 收边槽位而不是 id：断边全程留在整数空间，不为每条边付一次哈希往返。
    const stale = new Set<number>();
    this._prune(this._out[u]!, outputs, true, stale);
    this._prune(this._in[u]!, inputs, false, stale);

    this.batch(() => {
      for (const e of stale) this._sever(e);
      if (this._wants("nodeReshaped", true)) {
        this._queue.push("nodeReshaped", { node, slot: u, inputs, outputs });
      }
    });
    return this;
  }

  /** 零分配地读节点权重。 */
  public weightOf(node: NodeId): N | undefined {
    const u = this._nodes.indexOf(node);
    return u < 0 ? undefined : this._weight[u];
  }

  /** @throws {@link Missing} 节点不存在 */
  public setWeight(node: NodeId, weight: N | undefined): this {
    return this.updateNode(node, () => weight);
  }

  /** @throws {@link Missing} 节点不存在 */
  public updateNode(
    node: NodeId,
    update: (weight: N | undefined) => N | undefined,
  ): this {
    const u = this._nodes.indexOf(node);
    if (u < 0) throw new Missing("node", node);
    const before = this._weight[u];
    const after = update(before);
    this._weight[u] = after;
    if (this._wants("nodeUpdated", false)) {
      this._queue.push("nodeUpdated", { node, slot: u, before, after });
    }
    this._commit();
    return this;
  }

  /**
   * 在源节点的输出端口与目标节点的输入端口之间建边。
   *
   * @throws {@link Missing} 节点或端口不存在
   * @throws {@link Mismatch} 两端数据类型不兼容
   * @throws {@link Capacity} 端口声明了 `multiple: false` 且已连接
   * @throws {@link Duplicate} 指定的边 id 已存在
   */
  public connect(
    from: Anchor,
    to: Anchor,
    options: ConnectOptions<E> = {},
  ): EdgeId {
    const [sourceId, sourceName] = from;
    const [targetId, targetName] = to;

    const u = this._nodes.indexOf(sourceId);
    if (u < 0) throw new Missing("node", sourceId, "connect source");
    const v = this._nodes.indexOf(targetId);
    if (v < 0) throw new Missing("node", targetId, "connect target");

    const source = this._outputs[u]![sourceName];
    if (!source)
      throw new Missing("port", `${sourceId}:${sourceName}`, "output");
    const target = this._inputs[v]![targetName];
    if (!target)
      throw new Missing("port", `${targetId}:${targetName}`, "input");

    if (!source.socket.accepts(target.socket)) {
      throw new Mismatch(source.socket.name, target.socket.name);
    }
    if (
      !source.multiple &&
      this._occupied(this._out[u]!, this._fromPort, sourceName)
    ) {
      throw new Capacity(sourceId, sourceName);
    }
    if (
      !target.multiple &&
      this._occupied(this._in[v]!, this._toPort, targetName)
    ) {
      throw new Capacity(targetId, targetName);
    }

    let id = options.id;
    if (id === undefined) id = this._mint();
    else {
      if (this._edges.has(id)) throw new Duplicate("edge", id);
      this._reserve(id);
    }

    const e = this._edges.add(id);
    this._from[e] = u;
    this._to[e] = v;
    this._fromPort[e] = sourceName;
    this._toPort[e] = targetName;
    this._edgeWeight[e] = options.weight;
    this._outAt[e] = this._out[u]!.push(e) - 1;
    this._inAt[e] = this._in[v]!.push(e) - 1;
    if (this._wants("edgeAdded", true)) {
      this._queue.push("edgeAdded", {
        edge: id,
        slot: e,
        source: sourceId,
        target: targetId,
      });
    }
    this._commit();
    return id;
  }

  public disconnect(edge: EdgeId): boolean {
    const e = this._edges.indexOf(edge);
    if (e < 0) return false;
    this._sever(e);
    this._commit();
    return true;
  }

  public edge(edge: EdgeId): EdgeRecord<E> | undefined {
    const e = this._edges.indexOf(edge);
    return e < 0 ? undefined : this._record(e);
  }

  /** 按槽位取边记录，跳过 id 查表；空位返回 `undefined`。 */
  public edgeAt(slot: number): EdgeRecord<E> | undefined {
    return this._edges.at(slot) === undefined ? undefined : this._record(slot);
  }

  public edgeWeight(edge: EdgeId): E | undefined {
    const e = this._edges.indexOf(edge);
    return e < 0 ? undefined : this._edgeWeight[e];
  }

  /**
   * 按槽位读边权，跳过 id 查表。
   *
   * @remarks 快照的增量重编译走这条路：结构没变时槽位不会移动，于是「重算全部边权」
   *   是一遍纯整数下标的线性扫。
   */
  public edgeWeightAt(slot: number): E | undefined {
    return this._edgeWeight[slot];
  }

  /** @throws {@link Missing} 边不存在 */
  public setEdgeWeight(edge: EdgeId, weight: E | undefined): this {
    return this.updateEdge(edge, () => weight);
  }

  /** @throws {@link Missing} 边不存在 */
  public updateEdge(
    edge: EdgeId,
    update: (weight: E | undefined) => E | undefined,
  ): this {
    const e = this._edges.indexOf(edge);
    if (e < 0) throw new Missing("edge", edge);
    const before = this._edgeWeight[e];
    const after = update(before);
    this._edgeWeight[e] = after;
    if (this._wants("edgeUpdated", false)) {
      this._queue.push("edgeUpdated", { edge, slot: e, before, after });
    }
    this._commit();
    return this;
  }

  public outDegree(node: NodeId): number {
    const u = this._nodes.indexOf(node);
    return u < 0 ? 0 : this._out[u]!.length;
  }

  public inDegree(node: NodeId): number {
    const u = this._nodes.indexOf(node);
    return u < 0 ? 0 : this._in[u]!.length;
  }

  public degree(node: NodeId): number {
    return this.outDegree(node) + this.inDegree(node);
  }

  public outNeighbors(node: NodeId): NodeId[] {
    return this._project(node, true);
  }

  public inNeighbors(node: NodeId): NodeId[] {
    return this._project(node, false);
  }

  public neighbors(node: NodeId): NodeId[] {
    return [...this.inNeighbors(node), ...this.outNeighbors(node)];
  }

  public outEdges(node: NodeId): EdgeId[] {
    return this._labels(node, true);
  }

  public inEdges(node: NodeId): EdgeId[] {
    return this._labels(node, false);
  }

  /**
   * 按存储顺序枚举全部节点，不经 id 查表；`slot` 是节点索引。
   * 全图扫描（编译快照、打包、求差）走这条路，省掉每个节点一次字符串哈希。
   */
  public forEachNode(
    visit: (node: NodeId, weight: N | undefined, slot: number) => void,
  ): void {
    for (let u = 0; u < this._nodes.bound; u++) {
      const id = this._nodes.at(u);
      if (id !== undefined) visit(id, this._weight[u], u);
    }
  }

  /** 按存储顺序枚举全部边，不经 id 查表；`slot` 是边索引。 */
  public forEachEdge(visit: (edge: EdgeRecord<E>, slot: number) => void): void {
    for (let e = 0; e < this._edges.bound; e++) {
      if (this._edges.at(e) === undefined) continue;
      visit(this._record(e), e);
    }
  }

  /**
   * 只给整数的边枚举：`(边槽位, 源节点槽位, 目标节点槽位)`。
   *
   * @remarks 全程不碰字符串、不分配对象。快照编译的主循环走这条路：换成
   *   {@link Graph.forEachEdge} 的话，每条边要多付一次记录分配加两次 id 哈希。
   */
  public forEachLink(
    visit: (edge: number, source: number, target: number) => void,
  ): void {
    for (let e = 0; e < this._edges.bound; e++) {
      if (this._edges.at(e) === undefined) continue;
      visit(e, this._from[e]!, this._to[e]!);
    }
  }

  /** 枚举全部「子 → 父」关系，不经 id 查表。 */
  public forEachParent(visit: (node: NodeId, parent: NodeId) => void): void {
    for (let u = 0; u < this._nodes.bound; u++) {
      const id = this._nodes.at(u);
      if (id === undefined) continue;
      const p = this._parent[u]!;
      if (p !== NONE) visit(id, this._nodes.key(p));
    }
  }

  /**
   * 零分配地枚举出边；`visit` 返回 `false` 可提前停止。
   * `port` 是本端（源侧）的端口名，据此可只处理某个引脚上的连接。
   */
  public forEachOut(
    node: NodeId,
    visit: (target: NodeId, edge: EdgeId, port: string) => boolean | void,
  ): void {
    this._walk(node, true, visit);
  }

  /** 零分配地枚举入边；`port` 是本端（目标侧）的端口名。 */
  public forEachIn(
    node: NodeId,
    visit: (source: NodeId, edge: EdgeId, port: string) => boolean | void,
  ): void {
    this._walk(node, false, visit);
  }

  /** 纯整数的出边枚举：`(目标槽位, 边槽位)`，`visit` 返回 `false` 提前停止。 */
  public forEachOutAt(
    slot: number,
    visit: (target: number, edge: number) => boolean | void,
  ): void {
    this._crawl(slot, true, visit);
  }

  /** 纯整数的入边枚举：`(来源槽位, 边槽位)`。 */
  public forEachInAt(
    slot: number,
    visit: (source: number, edge: number) => boolean | void,
  ): void {
    this._crawl(slot, false, visit);
  }

  /**
   * 某个输出端口连出的目标。无连接返回 `undefined`；端口上有多条边时返回其中一条
   * （内部次序会被删边的 swap-pop 打乱，不保证是最早建立的），要全部就用
   * {@link Graph.forEachOut} 按 `port` 过滤。
   *
   * @remarks 编排执行器的最内层查询——"这个引脚接到哪"。直读平行数组，无中间数组与对象。
   */
  public linkedTo(node: NodeId, port: string): NodeId | undefined {
    return this._peer(node, port, true);
  }

  /** 某个输入端口的来源，语义同 {@link Graph.linkedTo}。 */
  public linkedFrom(node: NodeId, port: string): NodeId | undefined {
    return this._peer(node, port, false);
  }

  /** 全部 `source → target` 的平行边。 */
  public between(source: NodeId, target: NodeId): EdgeId[] {
    const u = this._nodes.indexOf(source);
    const v = this._nodes.indexOf(target);
    if (u < 0 || v < 0) return [];
    const found: EdgeId[] = [];
    for (const e of this._out[u]!) {
      if (this._to[e] === v) found.push(this._edges.key(e));
    }
    return found;
  }

  public adjacent(source: NodeId, target: NodeId): boolean {
    const u = this._nodes.indexOf(source);
    const v = this._nodes.indexOf(target);
    if (u < 0 || v < 0) return false;
    const list = this._out[u]!;
    for (let i = 0; i < list.length; i++) {
      if (this._to[list[i]!] === v) return true;
    }
    return false;
  }

  /**
   * 归入分组。
   *
   * @throws {@link Missing} 节点或父节点不存在
   * @throws {@link Nested} 会形成层级环
   */
  public setParent(node: NodeId, parent: NodeId): this {
    const u = this._nodes.indexOf(node);
    if (u < 0) throw new Missing("node", node, "setParent child");
    const p = this._nodes.indexOf(parent);
    if (p < 0) throw new Missing("node", parent, "setParent parent");
    for (let cursor = p; cursor !== NONE; cursor = this._parent[cursor]!) {
      if (cursor === u) throw new Nested(node, parent);
    }
    this._reparent(u, p);
    this._commit();
    return this;
  }

  public unparent(node: NodeId): this {
    const u = this._nodes.indexOf(node);
    if (u >= 0) {
      this._reparent(u, NONE);
      this._commit();
    }
    return this;
  }

  public parent(node: NodeId): NodeId | undefined {
    const u = this._nodes.indexOf(node);
    if (u < 0) return undefined;
    const p = this._parent[u]!;
    return p === NONE ? undefined : this._nodes.at(p);
  }

  /** 按槽位取父节点槽位；无父或空位返回 -1。 */
  public parentAt(slot: number): number {
    const p = this._parent[slot];
    return p === undefined ? NONE : p;
  }

  public children(node: NodeId): NodeId[] {
    const u = this._nodes.indexOf(node);
    if (u < 0) return [];
    return (this._children[u] ?? []).map((child) => this._nodes.key(child));
  }

  /**
   * 事务：期间的事件缓冲到最外层结束时统一派发，随后放一次 `flushed`；抛错也照常派发
   * 已积累的事件。
   */
  public batch<T>(work: () => T): T {
    this._depth++;
    try {
      return work();
    } finally {
      this._depth--;
      if (this._depth === 0) this._settle();
    }
  }

  /** 按槽位扫，不物化 id 数组也不为每条边付一次哈希。 */
  public clearEdges(): void {
    this.batch(() => {
      for (let e = 0; e < this._edges.bound; e++) {
        if (this._edges.at(e) !== undefined) this._sever(e);
      }
    });
  }

  public clear(): void {
    this.batch(() => {
      for (let u = 0; u < this._nodes.bound; u++) {
        const id = this._nodes.at(u);
        if (id !== undefined) this._drop(u, id);
      }
    });
  }

  /**
   * 回收删除留下的空位并重新稠密编号，并派发 `compacted`（带旧 → 新索引映射）。
   * 此前取得的索引全部失效，订阅者必须据映射重映射自己的缓存。
   */
  public compact(): void {
    if (
      this._nodes.bound === this._nodes.size &&
      this._edges.bound === this._edges.size
    ) {
      return;
    }
    const nodes = this._nodes.compact();
    const edges = this._edges.compact();
    const order = this._nodes.bound;
    const size = this._edges.bound;

    gather(this._weight, nodes, order);
    gather(this._inputs, nodes, order);
    gather(this._outputs, nodes, order);
    gather(this._out, nodes, order);
    gather(this._in, nodes, order);
    gather(this._parent, nodes, order);
    gather(this._children, nodes, order);
    gather(this._childAt, nodes, order);
    gather(this._from, edges, size);
    gather(this._to, edges, size);
    gather(this._fromPort, edges, size);
    gather(this._toPort, edges, size);
    gather(this._edgeWeight, edges, size);
    // 位置索引跟着边一起搬：`remap` 只改列表元素的值，不动它们的次序，所以下标本身不变。
    gather(this._outAt, edges, size);
    gather(this._inAt, edges, size);

    for (let e = 0; e < size; e++) {
      this._from[e] = nodes[this._from[e]!]!;
      this._to[e] = nodes[this._to[e]!]!;
    }
    for (let u = 0; u < order; u++) {
      remap(this._out[u]!, edges);
      remap(this._in[u]!, edges);
      const parent = this._parent[u]!;
      this._parent[u] = parent === NONE ? NONE : nodes[parent]!;
      const children = this._children[u];
      if (children) remap(children, nodes);
    }
    if (this._wants("compacted", true)) {
      this._queue.push("compacted", { nodes, edges });
    }
    this._commit();
  }

  /** 深拷贝，含层级。 */
  public copy(): Graph<N, E> {
    return this._rebuild(new Graph<N, E>(this.id));
  }

  /** 诱导子图：只保留两端都在 `keep` 内的边。 */
  public subgraph(keep: Iterable<NodeId>): Graph<N, E> {
    return this._rebuild(new Graph<N, E>(this.id), new Set(keep));
  }

  /**
   * 并图；重复的节点与边以本图为准。
   *
   * @throws {@link Missing} / {@link Mismatch} / {@link Capacity} `other` 的边在本图的
   *   同名节点上连不上——端口不存在、Socket 不兼容或单连接容量已被占。两图对同名节点
   *   声明了不同端口时就会这样，并图前先对齐形状。
   */
  public union(other: Graph<N, E>): Graph<N, E> {
    return other._rebuild(this.copy());
  }

  private _rebuild(into: Graph<N, E>, keep?: ReadonlySet<NodeId>): Graph<N, E> {
    const inside = (node: NodeId): boolean =>
      keep === undefined || keep.has(node);

    into.batch(() => {
      for (const id of this._nodes.keys()) {
        if (inside(id) && !into.hasNode(id)) into.addNode(this.node(id)!);
      }
      for (const id of this._edges.keys()) {
        if (into.hasEdge(id)) continue;
        const e = this._edges.indexOf(id);
        const source = this._nodes.key(this._from[e]!);
        const target = this._nodes.key(this._to[e]!);
        if (!inside(source) || !inside(target)) continue;
        into.connect([source, this._fromPort[e]!], [target, this._toPort[e]!], {
          id,
          weight: this._edgeWeight[e],
        });
      }
      for (const id of this._nodes.keys()) {
        const parent = this.parent(id);
        if (
          parent !== undefined &&
          inside(id) &&
          inside(parent) &&
          into.parent(id) === undefined
        ) {
          into.setParent(id, parent);
        }
      }
    });
    return into;
  }

  private _record(e: number): EdgeRecord<E> {
    return {
      id: this._edges.key(e),
      source: this._nodes.key(this._from[e]!),
      target: this._nodes.key(this._to[e]!),
      sourcePort: this._fromPort[e]!,
      targetPort: this._toPort[e]!,
      weight: this._edgeWeight[e],
    };
  }

  /**
   * 删一条边：两端摘链、释放槽位、登记 `edgeDropped`。全程按边槽位走，不经 id 查表，
   * 因此四条删边路径（`disconnect` / `clearEdges` / `reshape` / `dropNode`）都能直接用它。
   */
  private _sever(e: number): void {
    unhook(this._out[this._from[e]!]!, this._outAt, e);
    unhook(this._in[this._to[e]!]!, this._inAt, e);

    const edge = this._edges.key(e);
    // 载荷要在释放之前取：`_wants` 之后端点与权重就该视作已失效。
    const payload = this._wants("edgeDropped", true)
      ? {
          edge,
          slot: e,
          source: this._nodes.key(this._from[e]!),
          target: this._nodes.key(this._to[e]!),
          weight: this._edgeWeight[e],
        }
      : undefined;
    this._edgeWeight[e] = undefined;
    this._edges.remove(edge);
    if (payload) this._queue.push("edgeDropped", payload);
  }

  /** 某一侧的关联边下标；未知节点返回空。 */
  private _incident(node: NodeId, outward: boolean): number[] {
    const u = this._nodes.indexOf(node);
    if (u < 0) return [];
    return (outward ? this._out : this._in)[u]!;
  }

  private _project(node: NodeId, outward: boolean): NodeId[] {
    const list = this._incident(node, outward);
    const ends = outward ? this._to : this._from;
    const found: NodeId[] = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      found[i] = this._nodes.key(ends[list[i]!]!);
    }
    return found;
  }

  private _labels(node: NodeId, outward: boolean): EdgeId[] {
    const list = this._incident(node, outward);
    const found: EdgeId[] = new Array(list.length);
    for (let i = 0; i < list.length; i++) found[i] = this._edges.key(list[i]!);
    return found;
  }

  private _walk(
    node: NodeId,
    outward: boolean,
    visit: (other: NodeId, edge: EdgeId, port: string) => boolean | void,
  ): void {
    const list = this._incident(node, outward);
    const ends = outward ? this._to : this._from;
    const ports = outward ? this._fromPort : this._toPort;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      const stop =
        visit(this._nodes.key(ends[e]!), this._edges.key(e), ports[e]!) ===
        false;
      if (stop) return;
    }
  }

  private _crawl(
    slot: number,
    outward: boolean,
    visit: (other: number, edge: number) => boolean | void,
  ): void {
    const list = (outward ? this._out : this._in)[slot];
    if (list === undefined) return;
    const ends = outward ? this._to : this._from;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (visit(ends[e]!, e) === false) return;
    }
  }

  private _peer(
    node: NodeId,
    port: string,
    outward: boolean,
  ): NodeId | undefined {
    const u = this._nodes.indexOf(node);
    if (u < 0) return undefined;
    const list = outward ? this._out[u]! : this._in[u]!;
    const ports = outward ? this._fromPort : this._toPort;
    const ends = outward ? this._to : this._from;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (ports[e] === port) return this._nodes.key(ends[e]!);
    }
    return undefined;
  }

  /** 收集在新端口集合下不再合法的边，给出边槽位。 */
  private _prune(
    list: number[],
    own: Ports,
    outward: boolean,
    stale: Set<number>,
  ): void {
    const ownPorts = outward ? this._fromPort : this._toPort;
    const peerPorts = outward ? this._toPort : this._fromPort;
    const peerNodes = outward ? this._to : this._from;
    const peerSide = outward ? this._inputs : this._outputs;
    const taken = new Set<string>();

    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      const name = ownPorts[e]!;
      const port = own[name];
      if (!port) {
        stale.add(e);
        continue;
      }
      // 兼容性按边的实际方向判定——`accepts` 的 compatible 列表不对称。
      const peer = peerSide[peerNodes[e]!]![peerPorts[e]!];
      const fits =
        peer !== undefined &&
        (outward
          ? port.socket.accepts(peer.socket)
          : peer.socket.accepts(port.socket));
      if (!fits) {
        stale.add(e);
        continue;
      }
      if (port.multiple) continue;
      if (taken.has(name)) stale.add(e);
      else taken.add(name);
    }
  }

  private _occupied(list: number[], ports: string[], name: string): boolean {
    for (let i = 0; i < list.length; i++) {
      if (ports[list[i]!] === name) return true;
    }
    return false;
  }

  private _reparent(u: number, parent: number): void {
    const before = this._parent[u]!;
    if (before === parent) return;
    this._detach(u);
    this._parent[u] = parent;
    if (parent !== NONE) {
      this._childAt[u] = (this._children[parent] ??= []).push(u) - 1;
    }
    if (this._wants("parentChanged", true)) {
      this._queue.push("parentChanged", {
        node: this._nodes.key(u),
        slot: u,
        before: before === NONE ? undefined : this._nodes.at(before),
        after: parent === NONE ? undefined : this._nodes.at(parent),
      });
    }
  }

  private _detach(u: number): void {
    const parent = this._parent[u]!;
    this._parent[u] = NONE;
    if (parent === NONE) return;
    const siblings = this._children[parent];
    if (siblings) unhook(siblings, this._childAt, u);
  }

  private _mint(): EdgeId {
    let id: EdgeId;
    do {
      id = edgeId(`e${this._sequence++}`);
    } while (this._edges.has(id));
    return id;
  }

  /**
   * 让自动编号跳过外部指定的 id。
   *
   * 拷贝、反序列化、撤销重做都会带着原有的 `e<n>` 建边；不在这里推进游标，
   * 下一次自动分配就得从 `e0` 起把它们逐个撞过去——一次 O(E) 的空转。
   */
  private _reserve(id: EdgeId): void {
    if (!id.startsWith("e")) return;
    const seen = Number(id.slice(1));
    if (Number.isInteger(seen) && seen >= this._sequence) {
      this._sequence = seen + 1;
    }
  }

  /**
   * 推进版本号，并回答「这个事件有人听吗」。
   *
   * @remarks 返回 `false` 时调用方连载荷对象都不构造，于是无人订阅的变更热路径零分配。
   *   批量导入几万条变更时，这决定了事务里是空的还是堆着几万个载荷。
   */
  private _wants<K extends keyof Events<N, E>>(
    type: K,
    shape: boolean,
  ): boolean {
    this._revision++;
    if (shape) this._shape++;
    this._changes++;
    // 一个订阅者都没有是批量导入的常态，先用两次属性读挡掉，别去查按键分桶的表。
    const signal = this.signal;
    if (!signal.has()) return false;
    return signal.has(type) || signal.has("*");
  }

  private _commit(): void {
    if (this._depth === 0) this._settle();
  }

  /**
   * 事务收尾：按序放出缓冲的事件，再放一次 `flushed`。
   *
   * @remarks handler 里继续改图是常态（比如布局据此插节点）。那些变更会照常排进同一个
   *   队列，由这里接着收——重入的 `_settle` 直接返回，不另起一轮。否则内层会把外层的
   *   计数抢走并提前放出 `flushed`，外层剩下的事件反而排在事务边界之后。
   *
   *   handler 抛错不打断派发（`rescue` 兜住），但错误会在队列排空后上抛：订阅者之间
   *   互不牵连，调用方也不会以为一切正常。
   */
  private _settle(): void {
    if (this._settling) return;
    this._settling = true;
    try {
      const queue = this._queue;
      const signal = this.signal;
      while (queue.length > 0 || this._changes > 0) {
        while (queue.length > 0) {
          // 先摘下来再派发：handler 改图时不会与本轮迭代抢同一个数组。
          const queued = queue.splice(0, queue.length);
          for (let i = 0; i < queued.length; i += 2) {
            signal.emit(
              queued[i] as keyof Events<N, E>,
              queued[i + 1] as never,
            );
          }
        }
        const changes = this._changes;
        this._changes = 0;
        if (
          changes > 0 &&
          signal.has() &&
          (signal.has("flushed") || signal.has("*"))
        ) {
          signal.emit("flushed", { changes });
        }
      }
    } finally {
      this._settling = false;
    }
    if (this._failures.length > 0) {
      const failures = this._failures.splice(0, this._failures.length);
      if (failures.length === 1) throw failures[0];
      throw new AggregateError(failures, `${failures.length} handlers failed`);
    }
  }
}

/**
 * 按位置索引从无序列表里摘掉一项，O(1)：末尾那项补位，并改写补位者的位置索引。
 *
 * @remarks 边的两条邻接表与分组的子表共用这一个原语。换成在列表上 `indexOf` 就是
 *   O(size)，清空一个高扇出节点的连线会整体退化成平方。
 */
function unhook(list: number[], place: number[], item: number): void {
  const at = place[item]!;
  const last = list.length - 1;
  if (at !== last) {
    const moved = list[last]!;
    list[at] = moved;
    place[moved] = at;
  }
  list.pop();
}

function remap(list: number[], mapping: Int32Array): void {
  for (let i = 0; i < list.length; i++) list[i] = mapping[list[i]!]!;
}
