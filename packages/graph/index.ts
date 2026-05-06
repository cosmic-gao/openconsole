declare const __brand: unique symbol

export type Brand<T, B extends string> = T & {
  readonly [__brand]: B
}

export type Id<B extends string> = Brand<string, B>

export type NodeId = Id<'Node'>
export type EdgeId = Id<'Edge'>
export type SocketId = Id<'Socket'>

// ============================================================
// 2. Direction
// ============================================================

export type Direction = 'in' | 'out'

// ============================================================
// 3. Socket —— 端口基类
// ============================================================

/**
 * 端口基类。
 *
 * 字段对应 Rete `Port`：id（端口独立 id）/ label / multipleConnections / index。
 * 加入 `direction` 与 `key`，表达"端口在节点上的方向 + 命名"。
 */
export class Socket {
  declare readonly id: SocketId
  declare readonly key: string
  declare readonly direction: Direction
  declare readonly label?: string
  declare readonly multipleConnections?: boolean
  declare readonly index?: number
}

// ============================================================
// 4. Input / Output —— 用子类固化方向
// ============================================================

/**
 * 输入端口：direction 编译期窄化为 'in'。
 * 默认 multipleConnections=false（参考 Rete `Input` 默认行为）。
 */
export class Input extends Socket {
  declare readonly direction: 'in'
}

/**
 * 输出端口：direction 编译期窄化为 'out'。
 * 默认 multipleConnections=true（参考 Rete `Output` 默认行为）。
 */
export class Output extends Socket {
  declare readonly direction: 'out'
}

export class Node<
  Inputs extends { [key: string]: Input } = { [key: string]: Input },
  Outputs extends { [key: string]: Output } = { [key: string]: Output },
> {
  public constructor(
    public readonly id: NodeId,
    public readonly inputs: Partial<Inputs>,
    public readonly outputs: Partial<Outputs>
  ) { }
}

export interface Endpoint<S extends Socket = Socket> {
  readonly id: NodeId
  readonly socket: S
}


export class Edge {
  public constructor(
    public readonly id: EdgeId,
    public readonly source: Endpoint<Output>,
    public readonly target: Endpoint<Input>
  ) { }
}
