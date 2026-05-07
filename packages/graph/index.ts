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

export type Direction = 'input' | 'output'

export class Socket {
  public constructor(public readonly name: string) { }

  public isCompatibleWith(other: Socket): boolean {
    return this === other || this.name === other.name
  }
}

export abstract class Port<S extends Socket = Socket> {
  public abstract readonly direction: Direction

  public constructor(
    public readonly socket: S,
    public readonly id: PortId,
    public readonly label?: string,
  ) { }
}

export class Input<S extends Socket = Socket> extends Port<S> {
  public readonly direction = 'input' as const
}

export class Output<S extends Socket = Socket> extends Port<S> {
  public readonly direction = 'output' as const
}

export type Sockets = { [K in string]?: Socket }
export type Inputs<I extends Sockets> = { [K in keyof I]?: Input<NonNullable<I[K]>> }
export type Outputs<O extends Sockets> = { [K in keyof O]?: Output<NonNullable<O[K]>> }

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
