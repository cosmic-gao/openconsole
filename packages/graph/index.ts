declare const __brand: unique symbol

export type Brand<T, B extends string> = T & {
  readonly [__brand]: B
}

export type Id<B extends string> = Brand<string, B>

export type NodeId = Id<'Node'>
export type EdgeId = Id<'Edge'>
export type PortId = Id<'Port'>

export type Direction = 'input' | 'output'

export class Socket {
  public constructor(public readonly name: string) { }
}

export abstract class Port<S extends Socket = Socket> {
  public abstract readonly direction: Direction

  protected constructor(
    public readonly socket: S,
    public readonly id: PortId,
  ) { }
}

export class Input<S extends Socket = Socket> extends Port<S> {
  public readonly direction: Direction = 'input'

  public constructor(socket: S, id: PortId) {
    super(socket, id)
  }
}

export class Output<S extends Socket = Socket> extends Port<S> {
  public readonly direction: Direction = 'output'

  public constructor(socket: S, id: PortId) {
    super(socket, id)
  }
}

export type Sockets = { [K: string]: Socket }
export type Inputs<I extends Sockets> = { [K in keyof I]?: Input<I[K]> }
export type Outputs<O extends Sockets> = { [K in keyof O]?: Output<O[K]> }

export class Node<
  I extends Sockets = Sockets,
  O extends Sockets = Sockets,
> {
  public readonly inputs: Inputs<I> = {}
  public readonly outputs: Outputs<O> = {}

  public constructor(public readonly id: NodeId) { }
}

export interface Endpoint<N extends Node, P extends Port> {
  readonly node: N
  readonly port: P
}

export class Edge<
  S extends Node = Node,
  T extends Node = Node,
> {
  public constructor(
    public readonly source: Endpoint<S, NonNullable<S['outputs'][keyof S['outputs']]>>,
    public readonly target: Endpoint<T, NonNullable<T['inputs'][keyof T['inputs']]>>,
    public readonly id: EdgeId,
  ) { }
}
