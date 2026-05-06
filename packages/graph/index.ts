declare const __brand: unique symbol

export type Brand<T, B extends string> = T & {
  readonly [__brand]: B
}

export type Id<B extends string> = Brand<string, B>

export type NodeId = Id<'Node'>
export type EdgeId = Id<'Edge'>
export type SocketId = Id<'Socket'>
export type EndpointId = Id<'Endpoint'>

export type Direction = 'input' | 'output'

export class Socket {
  public constructor(
    public readonly id: SocketId,
    public readonly key: string,
    public readonly direction: Direction,
  ) {}
}

export class Input extends Socket {
  public static readonly DIRECTION: 'input' = 'input'

  public constructor(
    public readonly id: SocketId,
    public readonly key: string,
  ) {
    super(id, key, Input.DIRECTION)
  }
}

export class Output extends Socket {
  public static readonly DIRECTION: 'output' = 'output'

  public constructor(
    public readonly id: SocketId,
    public readonly key: string,
  ) {
    super(id, key, Output.DIRECTION)
  }
}

export interface Endpoint<S extends Socket = Socket> {
  readonly id: EndpointId
  readonly socket: S
}

export class Node<
  Inputs extends Record<string, Input> = Record<string, Input>,
  Outputs extends Record<string, Output> = Record<string, Output>,
> {
  public constructor(
    public readonly id: NodeId,
    public readonly inputs: Partial<Inputs>,
    public readonly outputs: Partial<Outputs>,
  ) {}
}

export class Edge {
  public constructor(
    public readonly id: EdgeId,
    public readonly source: Endpoint<Output>,
    public readonly target: Endpoint<Input>,
  ) {}
}
