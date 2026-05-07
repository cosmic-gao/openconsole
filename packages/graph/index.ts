declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type NodeId = Brand<string, 'NodeId'>;
export type EdgeId = Brand<string, 'EdgeId'>;
export type PortId = Brand<string, 'PortId'>;
export type GraphId = Brand<string, 'GraphId'>;

export type Direction = 'input' | 'output';

export type Sockets = { [key: string]: Socket };
export type Inputs<I extends Sockets> = { [K in keyof I]?: Input<I[K]> };
export type Outputs<O extends Sockets> = { [K in keyof O]?: Output<O[K]> };

export class Socket<T extends string = string> {
  public readonly name: T;
  public readonly compatibleWith?: ReadonlyArray<Socket>;

  public constructor(name: T) { this.name = name; }

  public static from<T extends string>(name: T): Socket<T> {
    return new Socket(name) as Socket<T>;
  }

  public matches(other: Socket): boolean {
    if (this.name === '*' || other.name === '*') return true;
    if (this.name === other.name) return true;
    return this.compatibleWith?.some(c => c.name === other.name) ?? false;
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
  public abstract readonly direction: Direction;
  protected constructor(
    public readonly socket: S,
    public readonly id: PortId,
  ) {}
}

export class Input<S extends Socket = Socket> extends Port<S> {
  public readonly direction: 'input' = 'input';
  public readonly links: EdgeId[] = [];

  public constructor(socket: S, id: PortId) { super(socket, id); }

  public get hasLinks(): boolean { return this.links.length > 0; }
  public attach(edge_id: EdgeId): void {
    if (!this.links.includes(edge_id)) this.links.push(edge_id);
  }
  public detach(edge_id: EdgeId): boolean {
    const i = this.links.indexOf(edge_id);
    if (i !== -1) { this.links.splice(i, 1); return true; }
    return false;
  }
}

export class Output<S extends Socket = Socket> extends Port<S> {
  public readonly direction: 'output' = 'output';
  public constructor(socket: S, id: PortId) { super(socket, id); }
}

export class Node<
  I extends Sockets = Sockets,
  O extends Sockets = Sockets,
> {
  public readonly inputs: Inputs<I> = {} as Inputs<I>;
  public readonly outputs: Outputs<O> = {} as Outputs<O>;

  public constructor(public readonly id: NodeId) {}

  public addInput<K extends string & keyof I>(name: K, socket: I[K], id?: PortId): Input<I[K]> {
    const portId = id ?? `${String(this.id)}:in:${name}` as PortId;
    const input = new Input(socket, portId);
    this.inputs[name] = input as Input<I[K]>;
    return input;
  }

  public addOutput<K extends string & keyof O>(name: K, socket: O[K], id?: PortId): Output<O[K]> {
    const portId = id ?? `${String(this.id)}:out:${name}` as PortId;
    const output = new Output(socket, portId);
    this.outputs[name] = output as Output<O[K]>;
    return output;
  }

  public removeInput(name: string & keyof I): boolean {
    if (name in this.inputs) { delete this.inputs[name]; return true; }
    return false;
  }

  public removeOutput(name: string & keyof O): boolean {
    if (name in this.outputs) { delete this.outputs[name]; return true; }
    return false;
  }

  public hasInput(name: string & keyof I): boolean { return name in this.inputs; }
  public hasOutput(name: string & keyof O): boolean { return name in this.outputs; }
}

export class Endpoint {
  public constructor(
    public readonly node: Node,
    public readonly port: Port,
  ) {}

  public get nodeId(): NodeId { return this.node.id; }
  public get portId(): PortId { return this.port.id; }
}

export class Edge {
  public constructor(
    public readonly id: EdgeId,
    public readonly source: Endpoint,
    public readonly target: Endpoint,
    public readonly weight?: unknown,
  ) {}

  public get sourceId(): NodeId { return this.source.nodeId; }
  public get targetId(): NodeId { return this.target.nodeId; }
  public linksNode(nodeId: NodeId): boolean { return this.source.nodeId === nodeId || this.target.nodeId === nodeId; }
}

export class Graph {
  private readonly _nodes = new Map<NodeId, Node>();
  private readonly _edges = new Map<EdgeId, Edge>();
  private _dirty = true;
  private _order: NodeId[] | null = null;

  public constructor(public readonly id: GraphId) {}

  public get nodeCount(): number { return this._nodes.size; }
  public get edgeCount(): number { return this._edges.size; }

  public addNode(node: Node): this {
    if (this._nodes.has(node.id)) throw new Error(`Node ${String(node.id)} exists`);
    this._nodes.set(node.id, node);
    this._markDirty();
    return this;
  }

  public removeNode(nodeId: NodeId): Node | undefined {
    const node = this._nodes.get(nodeId);
    if (!node) return undefined;
    this._removeNodeEdges(nodeId);
    this._nodes.delete(nodeId);
    this._markDirty();
    return node;
  }

  public node(nodeId: NodeId): Node | undefined { return this._nodes.get(nodeId); }
  public hasNode(nodeId: NodeId): boolean { return this._nodes.has(nodeId); }
  public nodes(): IterableIterator<Node> { return this._nodes.values(); }

  public edge(edgeId: EdgeId): Edge | undefined { return this._edges.get(edgeId); }
  public hasEdge(edgeId: EdgeId): boolean { return this._edges.has(edgeId); }

  public addEdge(edge: Edge): this {
    if (this._edges.has(edge.id)) throw new Error(`Edge ${String(edge.id)} exists`);
    if (!this._nodes.has(edge.sourceId) || !this._nodes.has(edge.targetId)) {
      throw new Error('Edge must connect existing nodes');
    }
    if (!this._validate(edge)) throw new Error('Incompatible socket types');
    this._edges.set(edge.id, edge);
    this._syncPortLinks(edge, true);
    this._markDirty();
    return this;
  }

  public removeEdge(edgeId: EdgeId): Edge | undefined {
    const edge = this._edges.get(edgeId);
    if (!edge) return undefined;
    this._syncPortLinks(edge, false);
    this._edges.delete(edgeId);
    this._markDirty();
    return edge;
  }

  public incomingEdges(nodeId: NodeId): Edge[] {
    const result: Edge[] = [];
    for (const e of this._edges.values()) if (e.targetId === nodeId) result.push(e);
    return result;
  }

  public outgoingEdges(nodeId: NodeId): Edge[] {
    const result: Edge[] = [];
    for (const e of this._edges.values()) if (e.sourceId === nodeId) result.push(e);
    return result;
  }

  public edges(): IterableIterator<Edge> { return this._edges.values(); }

  public clear(): void {
    this._nodes.clear();
    this._edges.clear();
    this._markDirty();
  }

  public toJson(): object {
    return {
      id: this.id,
      nodes: Array.from(this._nodes.values()).map(n => ({
        id: n.id,
        inputs: Object.fromEntries(Object.entries(n.inputs).map(([k, v]) => [k, v ? { id: v.id, socket: v.socket.name } : null])),
        outputs: Object.fromEntries(Object.entries(n.outputs).map(([k, v]) => [k, v ? { id: v.id, socket: v.socket.name } : null])),
      })),
      edges: Array.from(this._edges.values()).map(e => ({
        id: e.id,
        source: { nodeId: e.source.nodeId, portId: e.source.portId },
        target: { nodeId: e.target.nodeId, portId: e.target.portId },
        weight: e.weight,
      })),
    };
  }

  public executionOrder(): NodeId[] {
    if (!this._dirty && this._order !== null) return this._order;
    this._order = this._computeTopologicalOrder();
    this._dirty = false;
    return this._order;
  }

  private _computeTopologicalOrder(): NodeId[] {
    const visited = new Set<NodeId>();
    const result: NodeId[] = [];
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
      result.push(nodeId);
      visited.add(nodeId);

      for (const neighbor of adjacency.get(nodeId) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    for (const nodeId of this._nodes.keys()) {
      if (!visited.has(nodeId)) result.push(nodeId);
    }

    return result;
  }

  private _validate(edge: Edge): boolean {
    const srcOut = Array.from(Object.values(edge.source.node.outputs)).find(p => p?.id === edge.source.portId);
    const tgtIn = Array.from(Object.values(edge.target.node.inputs)).find(p => p?.id === edge.target.portId);
    if (!srcOut || !tgtIn) return false;
    if (srcOut.direction !== 'output' || tgtIn.direction !== 'input') return false;
    return srcOut.socket.matches(tgtIn.socket);
  }

  private _syncPortLinks(edge: Edge, attach: boolean): void {
    const tgt = this._nodes.get(edge.targetId);
    if (!tgt) return;
    const input = Array.from(Object.values(tgt.inputs)).find(p => p?.id === edge.target.portId) as Input | undefined;
    if (input) attach ? input.attach(edge.id) : input.detach(edge.id);
  }

  private _removeNodeEdges(nodeId: NodeId): void {
    for (const edgeId of Array.from(this._edges.values()).filter(e => e.linksNode(nodeId)).map(e => e.id)) {
      this.removeEdge(edgeId);
    }
  }

  private _markDirty(): void { this._dirty = true; this._order = null; }
}