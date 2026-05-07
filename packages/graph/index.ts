declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type NodeId = Brand<string, 'NodeId'>;
export type EdgeId = Brand<string, 'EdgeId'>;
export type PortId = Brand<string, 'PortId'>;
export type GraphId = Brand<string, 'GraphId'>;

export type PortDirection = 'input' | 'output';
export type EdgeDirection = 'incoming' | 'outgoing';

export interface Cardinality {
  readonly order: number;
  readonly size: number;
}

export type Sockets = { readonly [key: string]: Socket };
export type Inputs<I extends Sockets> = { [K in keyof I]?: Input<I[K]> };
export type Outputs<O extends Sockets> = { [K in keyof O]?: Output<O[K]> };

export class Socket<T extends string = string> {
  public readonly name: T;
  public readonly compatible?: ReadonlyArray<Socket>;

  public constructor(name: T, compatible?: ReadonlyArray<Socket>) {
    this.name = name;
    this.compatible = compatible;
  }

  public static from<T extends string>(name: T, compatible?: ReadonlyArray<Socket>): Socket<T> {
    return new Socket(name, compatible);
  }

  public matches(other: Socket): boolean {
    if (this.name === '*' || other.name === '*') return true;
    if (this.name === other.name) return true;
    return this.compatible?.some(socket => socket.name === other.name) ?? false;
  }

  public static readonly number: Socket<'number'> = Object.freeze(new Socket('number')) as Socket<'number'>;
  public static readonly string: Socket<'string'> = Object.freeze(new Socket('string')) as Socket<'string'>;
  public static readonly boolean: Socket<'boolean'> = Object.freeze(new Socket('boolean')) as Socket<'boolean'>;
  public static readonly object: Socket<'object'> = Object.freeze(new Socket('object')) as Socket<'object'>;
  public static readonly array: Socket<'array'> = Object.freeze(new Socket('array')) as Socket<'array'>;
  public static readonly exec: Socket<'exec'> = Object.freeze(new Socket('exec')) as Socket<'exec'>;
  public static readonly any: Socket<'*'> = Object.freeze(new Socket('*')) as Socket<'*'>;
}

export abstract class Port<S extends Socket = Socket> {
  public abstract readonly direction: PortDirection;

  protected constructor(
    public readonly socket: S,
    public readonly id: PortId,
  ) { }
}

export class Input<S extends Socket = Socket> extends Port<S> {
  public readonly direction: 'input' = 'input';
  public readonly edges: EdgeId[] = [];

  public constructor(socket: S, id: PortId) {
    super(socket, id);
  }

  public get connected(): boolean {
    return this.edges.length > 0;
  }

  public attach(edge: EdgeId): void {
    if (!this.edges.includes(edge)) this.edges.push(edge);
  }

  public detach(edge: EdgeId): boolean {
    const index = this.edges.indexOf(edge);
    if (index === -1) return false;
    this.edges.splice(index, 1);
    return true;
  }
}

export class Output<S extends Socket = Socket> extends Port<S> {
  public readonly direction: 'output' = 'output';

  public constructor(socket: S, id: PortId) {
    super(socket, id);
  }
}

export class Node<
  I extends Sockets = Sockets,
  O extends Sockets = Sockets,
  W = unknown,
> {
  public readonly inputs: Inputs<I> = {} as Inputs<I>;
  public readonly outputs: Outputs<O> = {} as Outputs<O>;
  public weight: W | undefined;

  public constructor(public readonly id: NodeId, weight?: W) {
    this.weight = weight;
  }

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

  public removeInput(name: string & keyof I): boolean {
    if (!(name in this.inputs)) return false;
    delete this.inputs[name];
    return true;
  }

  public removeOutput(name: string & keyof O): boolean {
    if (!(name in this.outputs)) return false;
    delete this.outputs[name];
    return true;
  }

  public hasInput(name: string & keyof I): boolean {
    return name in this.inputs;
  }

  public hasOutput(name: string & keyof O): boolean {
    return name in this.outputs;
  }

  public input<K extends string & keyof I>(name: K): Input<I[K]> | undefined {
    return this.inputs[name] as Input<I[K]> | undefined;
  }

  public output<K extends string & keyof O>(name: K): Output<O[K]> | undefined {
    return this.outputs[name] as Output<O[K]> | undefined;
  }
}

export class Endpoint<
  N extends Node = Node,
  P extends Port = Port,
> {
  public constructor(
    public readonly node: N,
    public readonly port: P,
  ) { }

  public get nodeId(): NodeId {
    return this.node.id;
  }

  public get portId(): PortId {
    return this.port.id;
  }
}

export class Edge<W = unknown> {
  public weight: W | undefined;

  public constructor(
    public readonly id: EdgeId,
    public readonly source: Endpoint,
    public readonly target: Endpoint,
    weight?: W,
  ) {
    this.weight = weight;
  }

  public get sourceId(): NodeId {
    return this.source.nodeId;
  }

  public get targetId(): NodeId {
    return this.target.nodeId;
  }

  public connects(nodeId: NodeId): boolean {
    return this.source.nodeId === nodeId || this.target.nodeId === nodeId;
  }

  public opposite(direction: EdgeDirection): NodeId {
    return direction === 'incoming' ? this.source.nodeId : this.target.nodeId;
  }
}

export type StoredNode<W> = Node<Sockets, Sockets, W>;

export class Graph<N = unknown, E = unknown> {
  private readonly _nodes = new Map<NodeId, StoredNode<N>>();
  private readonly _edges = new Map<EdgeId, Edge<E>>();
  private _dirty = true;
  private _topology: NodeId[] | null = null;

  public constructor(public readonly id: GraphId) { }

  public get nodeCount(): number {
    return this._nodes.size;
  }

  public get edgeCount(): number {
    return this._edges.size;
  }

  public get cardinality(): Cardinality {
    return { order: this._nodes.size, size: this._edges.size };
  }

  public addNode<I extends Sockets, O extends Sockets>(
    node: Node<I, O, N>,
  ): this {
    if (this._nodes.has(node.id)) throw new Error(`Node ${String(node.id)} already exists`);
    this._nodes.set(node.id, node as unknown as StoredNode<N>);
    this._invalidate();
    return this;
  }

  public removeNode(nodeId: NodeId): StoredNode<N> | undefined {
    const node = this._nodes.get(nodeId);
    if (!node) return undefined;
    this._prune(nodeId);
    this._nodes.delete(nodeId);
    this._invalidate();
    return node;
  }

  public getNode(nodeId: NodeId): StoredNode<N> | undefined {
    return this._nodes.get(nodeId);
  }

  public hasNode(nodeId: NodeId): boolean {
    return this._nodes.has(nodeId);
  }

  public getNodes(): IterableIterator<StoredNode<N>> {
    return this._nodes.values();
  }

  public getEdge(edgeId: EdgeId): Edge<E> | undefined {
    return this._edges.get(edgeId);
  }

  public hasEdge(edgeId: EdgeId): boolean {
    return this._edges.has(edgeId);
  }

  public getEdges(): IterableIterator<Edge<E>> {
    return this._edges.values();
  }

  public addEdge(edge: Edge<E>): this {
    if (this._edges.has(edge.id)) throw new Error(`Edge ${String(edge.id)} already exists`);
    if (!this._nodes.has(edge.sourceId) || !this._nodes.has(edge.targetId)) {
      throw new Error('Edge must connect existing nodes');
    }
    if (!this._validate(edge)) throw new Error('Incompatible socket types');
    this._edges.set(edge.id, edge);
    this._link(edge, true);
    this._invalidate();
    return this;
  }

  public removeEdge(edgeId: EdgeId): Edge<E> | undefined {
    const edge = this._edges.get(edgeId);
    if (!edge) return undefined;
    this._link(edge, false);
    this._edges.delete(edgeId);
    this._invalidate();
    return edge;
  }

  public incomingEdges(nodeId: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this._edges.values()) {
      if (edge.targetId === nodeId) result.push(edge);
    }
    return result;
  }

  public outgoingEdges(nodeId: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this._edges.values()) {
      if (edge.sourceId === nodeId) result.push(edge);
    }
    return result;
  }

  public incidentEdges(nodeId: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this._edges.values()) {
      if (edge.connects(nodeId)) result.push(edge);
    }
    return result;
  }

  public edgesBetween(source: NodeId, target: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this._edges.values()) {
      if (edge.sourceId === source && edge.targetId === target) result.push(edge);
    }
    return result;
  }

  public edgesConnecting(left: NodeId, right: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this._edges.values()) {
      const matches =
        (edge.sourceId === left && edge.targetId === right) ||
        (edge.sourceId === right && edge.targetId === left);
      if (matches) result.push(edge);
    }
    return result;
  }

  public predecessors(nodeId: NodeId): NodeId[] {
    return this.incomingEdges(nodeId).map(edge => edge.sourceId);
  }

  public successors(nodeId: NodeId): NodeId[] {
    return this.outgoingEdges(nodeId).map(edge => edge.targetId);
  }

  public adjacencies(nodeId: NodeId): NodeId[] {
    return [...this.predecessors(nodeId), ...this.successors(nodeId)];
  }

  public inDegree(nodeId: NodeId): number {
    let count = 0;
    for (const edge of this._edges.values()) {
      if (edge.targetId === nodeId) count++;
    }
    return count;
  }

  public outDegree(nodeId: NodeId): number {
    let count = 0;
    for (const edge of this._edges.values()) {
      if (edge.sourceId === nodeId) count++;
    }
    return count;
  }

  public degree(nodeId: NodeId): number {
    return this.inDegree(nodeId) + this.outDegree(nodeId);
  }

  public sources(): StoredNode<N>[] {
    const result: StoredNode<N>[] = [];
    for (const node of this._nodes.values()) {
      if (this.inDegree(node.id) === 0) result.push(node);
    }
    return result;
  }

  public sinks(): StoredNode<N>[] {
    const result: StoredNode<N>[] = [];
    for (const node of this._nodes.values()) {
      if (this.outDegree(node.id) === 0) result.push(node);
    }
    return result;
  }

  public isolated(): StoredNode<N>[] {
    const result: StoredNode<N>[] = [];
    for (const node of this._nodes.values()) {
      if (this.degree(node.id) === 0) result.push(node);
    }
    return result;
  }

  public adjacent(source: NodeId, target: NodeId): boolean {
    for (const edge of this._edges.values()) {
      if (edge.sourceId === source && edge.targetId === target) return true;
    }
    return false;
  }

  public empty(): boolean {
    return this._nodes.size === 0;
  }

  public clear(): void {
    this._nodes.clear();
    this._edges.clear();
    this._invalidate();
  }

  public toJson(): object {
    return {
      id: this.id,
      nodes: Array.from(this._nodes.values()).map(node => ({
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
      edges: Array.from(this._edges.values()).map(edge => ({
        id: edge.id,
        source: { nodeId: edge.source.nodeId, portId: edge.source.portId },
        target: { nodeId: edge.target.nodeId, portId: edge.target.portId },
        weight: edge.weight,
      })),
    };
  }

  public topology(): NodeId[] {
    if (!this._dirty && this._topology !== null) return this._topology;
    this._topology = this._sort();
    this._dirty = false;
    return this._topology;
  }

  private _sort(): NodeId[] {
    const visited = new Set<NodeId>();
    const order: NodeId[] = [];
    const inDegree = new Map<NodeId, number>();
    const adjacency = new Map<NodeId, NodeId[]>();

    for (const nodeId of this._nodes.keys()) {
      inDegree.set(nodeId, 0);
      adjacency.set(nodeId, []);
    }

    for (const edge of this._edges.values()) {
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

    for (const nodeId of this._nodes.keys()) {
      if (!visited.has(nodeId)) order.push(nodeId);
    }

    return order;
  }

  private _validate(edge: Edge<E>): boolean {
    const sourceOutput = Object.values(edge.source.node.outputs)
      .find((port): port is Output => !!port && port.id === edge.source.portId);
    const targetInput = Object.values(edge.target.node.inputs)
      .find((port): port is Input => !!port && port.id === edge.target.portId);
    if (!sourceOutput || !targetInput) return false;
    if (sourceOutput.direction !== 'output' || targetInput.direction !== 'input') return false;
    return sourceOutput.socket.matches(targetInput.socket);
  }

  private _link(edge: Edge<E>, attach: boolean): void {
    const targetNode = this._nodes.get(edge.targetId);
    if (!targetNode) return;
    const input = Object.values(targetNode.inputs)
      .find((port): port is Input => !!port && port.id === edge.target.portId);
    if (!input) return;
    if (attach) input.attach(edge.id);
    else input.detach(edge.id);
  }

  private _prune(nodeId: NodeId): void {
    const incidentIds: EdgeId[] = [];
    for (const edge of this._edges.values()) {
      if (edge.connects(nodeId)) incidentIds.push(edge.id);
    }
    for (const edgeId of incidentIds) this.removeEdge(edgeId);
  }

  private _invalidate(): void {
    this._dirty = true;
    this._topology = null;
  }
}
