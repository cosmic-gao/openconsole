declare const __brand: unique symbol

export type Brand<T, B extends string> = T & {
  readonly [__brand]: B
}

export type Id<B extends string> = Brand<string, B>

export type NodeId = Id<'Node'>
export type EdgeId = Id<'Edge'>
export type SocketId = Id<'Socket'>
export type PortId = Id<'Port'>
export type EndpointId = Id<'Endpoint'>

export class Socket {
  public constructor(
    public readonly id: SocketId,
    public readonly name: string,
  ) { }
}

export class Port<S extends Socket = Socket> {
  public readonly id: PortId

  public constructor(
    public readonly socket: S,
    public readonly label?: string,
    public readonly multipleConnections?: boolean,
    public readonly index?: number,
  ) {
    this.id = Symbol() as unknown as PortId
  }
}

export class Input<S extends Socket = Socket> extends Port<S> {
  public constructor(
    socket: S,
    label?: string,
    multipleConnections: boolean = false,
    index?: number,
  ) {
    super(socket, label, multipleConnections, index)
  }
}

export class Output<S extends Socket = Socket> extends Port<S> {
  public constructor(
    socket: S,
    label?: string,
    multipleConnections: boolean = true,
    index?: number,
  ) {
    super(socket, label, multipleConnections, index)
  }
}

export class Node<
  Inputs extends Record<string, Input<Socket>> = Record<string, Input<Socket>>,
  Outputs extends Record<string, Output<Socket>> = Record<string, Output<Socket>>,
> {
  public readonly id: NodeId
  public readonly inputs: Partial<Inputs> = {}
  public readonly outputs: Partial<Outputs> = {}

  public constructor(
    public readonly label: string,
    id?: NodeId,
  ) {
    this.id = id ?? (Symbol() as unknown as NodeId)
  }
}

export interface Endpoint<
  N extends Node = Node,
  P extends Port = Port,
> {
  readonly id: EndpointId
  readonly node: N
  readonly port: P
}

export class Edge<
  S extends Node = Node,
  T extends Node = Node,
  O extends Output = Output,
  I extends Input = Input,
> {
  public constructor(
    public readonly id: EdgeId,
    public readonly source: Endpoint<S, O>,
    public readonly target: Endpoint<T, I>,
  ) { }
}
