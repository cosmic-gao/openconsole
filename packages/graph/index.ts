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

export type Direction = "input" | "output"

export class Socket {
  public constructor(public readonly name: string) { }
}

export class Port<S extends Socket> {
  public constructor(
    public readonly socket: S,
    public readonly index?: number,
    public readonly id?: PortId,
  ) {
  }
}

export class Input<S extends Socket> extends Port<S> {
  public static direction: Direction = 'input'

  public constructor(public socket: S) {
    super(socket)
  }
}

export class Output<S extends Socket> extends Port<S> {
  public static direction: Direction = 'output'

  public constructor(public socket: S) {
    super(socket)
  }
}

export class Node<
  I extends { [K in string]?: Socket } = { [K in string]?: Socket },
  O extends { [K in string]?: Socket } = { [K in string]?: Socket },
> {
  public readonly inputs: { [K in keyof I]?: Input<Exclude<I[K], undefined>> } = {}
  public readonly outputs: { [K in keyof O]?: Output<Exclude<O[K], undefined>> } = {}

  public constructor(public readonly id: NodeId) { }
}

export interface Endpoint<N extends Node, P extends Port<Socket>> {
  node: N
  port: P
}

export class Edge<
  S extends Node,
  T extends Node
> {
  public constructor(
    public readonly source: keyof S['inputs'],
    public readonly target: keyof T['outputs'],
    public readonly id: EdgeId,
  ) { }
}
