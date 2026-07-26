import { Signal } from "@openconsole/signal";

import { Capacity, Cycle, Duplicate, Mismatch, Missing } from "./error";
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
 * 显式回收。算法不直接吃 `Graph`，而是吃它编译出的 {@link Snapshot}。
 */
export class Graph<N = unknown, E = unknown> {
  public readonly signal = new Signal<Events<N, E>>();

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

  private _revision = 0;
  private _sequence = 0;
  private _depth = 0;
  private readonly _deferred: Array<() => void> = [];

  public constructor(public readonly id: GraphId) {}

  /** 任意变更（结构或权重）都会推进；{@link Snapshot} 据此判断自己是否已过期。 */
  public get revision(): number {
    return this._revision;
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
    this._touch(() => this.signal.emit("nodeAdded", { node: spec.id }));
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

    this.batch(() => {
      for (const e of [...this._out[u]!, ...this._in[u]!]) {
        const id = this._edges.at(e);
        if (id !== undefined) this.disconnect(id);
      }

      const grand = this._parent[u]!;
      for (const child of this._children[u] ?? []) {
        this._reparent(child, grand);
      }
      this._children[u] = undefined;
      this._detach(u);

      const weight = this._weight[u];
      this._weight[u] = undefined;
      this._inputs[u] = {};
      this._outputs[u] = {};
      this._nodes.remove(node);
      this._touch(() => this.signal.emit("nodeDropped", { node, weight }));
    });
    return true;
  }

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

    const stale = new Set<EdgeId>();
    this._prune(this._out[u]!, outputs, true, stale);
    this._prune(this._in[u]!, inputs, false, stale);

    this.batch(() => {
      for (const edge of stale) this.disconnect(edge);
      this._touch(() =>
        this.signal.emit("nodeReshaped", { node, inputs, outputs }),
      );
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
    this._touch(() => this.signal.emit("nodeUpdated", { node, before, after }));
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
    this._out[u]!.push(e);
    this._in[v]!.push(e);
    this._touch(() =>
      this.signal.emit("edgeAdded", {
        edge: id,
        source: sourceId,
        target: targetId,
      }),
    );
    return id;
  }

  public disconnect(edge: EdgeId): boolean {
    const e = this._edges.indexOf(edge);
    if (e < 0) return false;
    const source = this._nodes.key(this._from[e]!);
    const target = this._nodes.key(this._to[e]!);
    const weight = this._edgeWeight[e];

    unlink(this._out[this._from[e]!]!, e);
    unlink(this._in[this._to[e]!]!, e);
    this._edgeWeight[e] = undefined;
    this._edges.remove(edge);
    this._touch(() =>
      this.signal.emit("edgeDropped", { edge, source, target, weight }),
    );
    return true;
  }

  public edge(edge: EdgeId): EdgeRecord<E> | undefined {
    const e = this._edges.indexOf(edge);
    if (e < 0) return undefined;
    return {
      id: edge,
      source: this._nodes.key(this._from[e]!),
      target: this._nodes.key(this._to[e]!),
      sourcePort: this._fromPort[e]!,
      targetPort: this._toPort[e]!,
      weight: this._edgeWeight[e],
    };
  }

  public edgeWeight(edge: EdgeId): E | undefined {
    const e = this._edges.indexOf(edge);
    return e < 0 ? undefined : this._edgeWeight[e];
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
    this._touch(() => this.signal.emit("edgeUpdated", { edge, before, after }));
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
   * 按存储顺序枚举全部节点，不经 id 查表。
   * 全图扫描（编译快照、打包、求差）走这条路，省掉每个节点一次字符串哈希。
   */
  public forEachNode(
    visit: (node: NodeId, weight: N | undefined) => void,
  ): void {
    for (let u = 0; u < this._nodes.bound; u++) {
      const id = this._nodes.at(u);
      if (id !== undefined) visit(id, this._weight[u]);
    }
  }

  /** 按存储顺序枚举全部边，不经 id 查表。 */
  public forEachEdge(visit: (edge: EdgeRecord<E>) => void): void {
    for (let e = 0; e < this._edges.bound; e++) {
      const id = this._edges.at(e);
      if (id === undefined) continue;
      visit({
        id,
        source: this._nodes.key(this._from[e]!),
        target: this._nodes.key(this._to[e]!),
        sourcePort: this._fromPort[e]!,
        targetPort: this._toPort[e]!,
        weight: this._edgeWeight[e],
      });
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
   * @throws {@link Cycle} 会形成层级环
   */
  public setParent(node: NodeId, parent: NodeId): this {
    const u = this._nodes.indexOf(node);
    if (u < 0) throw new Missing("node", node, "setParent child");
    const p = this._nodes.indexOf(parent);
    if (p < 0) throw new Missing("node", parent, "setParent parent");
    for (let cursor = p; cursor !== NONE; cursor = this._parent[cursor]!) {
      if (cursor === u) throw new Cycle([node, parent]);
    }
    this._reparent(u, p);
    return this;
  }

  public unparent(node: NodeId): this {
    const u = this._nodes.indexOf(node);
    if (u >= 0) this._reparent(u, NONE);
    return this;
  }

  public parent(node: NodeId): NodeId | undefined {
    const u = this._nodes.indexOf(node);
    if (u < 0) return undefined;
    const p = this._parent[u]!;
    return p === NONE ? undefined : this._nodes.at(p);
  }

  public children(node: NodeId): NodeId[] {
    const u = this._nodes.indexOf(node);
    if (u < 0) return [];
    return (this._children[u] ?? []).map((child) => this._nodes.key(child));
  }

  /** 事务：期间的事件缓冲到最外层结束时统一派发，抛错也会派发已积累的事件。 */
  public batch<T>(work: () => T): T {
    this._depth++;
    try {
      return work();
    } finally {
      this._depth--;
      if (this._depth === 0) this._flush();
    }
  }

  public clearEdges(): void {
    this.batch(() => {
      for (const edge of this.edges()) this.disconnect(edge);
    });
  }

  public clear(): void {
    this.batch(() => {
      for (const node of this.nodes()) this.dropNode(node);
    });
  }

  /**
   * 回收删除留下的空位并重新稠密编号。会使此前取得的节点索引全部失效，
   * 因此只在批量删除后、开始新一轮索引使用前调用。
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
    gather(this._from, edges, size);
    gather(this._to, edges, size);
    gather(this._fromPort, edges, size);
    gather(this._toPort, edges, size);
    gather(this._edgeWeight, edges, size);

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
    this._revision++;
  }

  /** 深拷贝，含层级。 */
  public copy(): Graph<N, E> {
    return this._rebuild(new Graph<N, E>(this.id));
  }

  /** 同 id 的空图。 */
  public emptyCopy(): Graph<N, E> {
    return new Graph<N, E>(this.id);
  }

  /** 诱导子图：只保留两端都在 `keep` 内的边。 */
  public subgraph(keep: Iterable<NodeId>): Graph<N, E> {
    return this._rebuild(new Graph<N, E>(this.id), new Set(keep));
  }

  /** 并图；重复的节点与边以本图为准。 */
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

  /** 收集在新端口集合下不再合法的边。 */
  private _prune(
    list: number[],
    own: Ports,
    outward: boolean,
    stale: Set<EdgeId>,
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
        stale.add(this._edges.key(e));
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
        stale.add(this._edges.key(e));
        continue;
      }
      if (port.multiple) continue;
      if (taken.has(name)) stale.add(this._edges.key(e));
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
      (this._children[parent] ??= []).push(u);
    }
    const node = this._nodes.key(u);
    this._touch(() =>
      this.signal.emit("parentChanged", {
        node,
        before: before === NONE ? undefined : this._nodes.at(before),
        after: parent === NONE ? undefined : this._nodes.at(parent),
      }),
    );
  }

  private _detach(u: number): void {
    const parent = this._parent[u]!;
    this._parent[u] = NONE;
    if (parent === NONE) return;
    const siblings = this._children[parent];
    if (siblings) unlink(siblings, u);
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

  private _touch(emit: () => void): void {
    this._revision++;
    if (this._depth > 0) this._deferred.push(emit);
    else emit();
  }

  private _flush(): void {
    if (this._deferred.length === 0) return;
    const queued = this._deferred.splice(0, this._deferred.length);
    for (const emit of queued) emit();
  }
}

/** 从无序列表中移除一个值（swap-pop）。 */
function unlink(list: number[], value: number): void {
  const at = list.indexOf(value);
  if (at < 0) return;
  const last = list.length - 1;
  if (at !== last) list[at] = list[last]!;
  list.pop();
}

function remap(list: number[], mapping: Int32Array): void {
  for (let i = 0; i < list.length; i++) list[i] = mapping[list[i]!]!;
}
