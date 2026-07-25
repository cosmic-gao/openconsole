import type { NodeId } from "./ident";
import type { Socket, Sockets } from "./socket";

/** 端口上的连接约束。 */
export interface Constraints {
  /** 允许连接多条边，默认 `true`。 */
  multiple?: boolean;
  /** 标记为必连（声明性元数据，不参与校验）。 */
  required?: boolean;
  /** 未连接时的取值（声明性元数据）。 */
  fallback?: unknown;
}

/**
 * 端口声明：不可变值对象，不持有任何连接状态，可在节点与图之间自由共享。
 * 边由 {@link Graph} 独家持有，端口只描述"这里能接什么"。
 */
export class Port<S extends Socket = Socket> {
  public readonly multiple: boolean;
  public readonly required: boolean;
  public readonly fallback: unknown;

  public constructor(
    public readonly socket: S,
    constraints: Constraints = {},
  ) {
    this.multiple = constraints.multiple ?? true;
    this.required = constraints.required ?? false;
    this.fallback = constraints.fallback;
  }
}

type Declared<S extends Sockets> = { [K in keyof S]?: Port<S[K]> };

/**
 * 节点模板：命名端口集合加权重。加入图时按值拷入，因此同一模板可用于多张图、
 * 也可在加入后继续复用。
 */
export class Vertex<
  I extends Sockets = Sockets,
  O extends Sockets = Sockets,
  W = unknown,
> {
  public readonly inputs: Declared<I> = {};
  public readonly outputs: Declared<O> = {};

  public constructor(
    public readonly id: NodeId,
    public weight?: W,
  ) {}

  public addInput<K extends string & keyof I>(
    name: K,
    socket: I[K],
    constraints?: Constraints,
  ): this {
    this.inputs[name] = new Port(socket, constraints);
    return this;
  }

  public addOutput<K extends string & keyof O>(
    name: K,
    socket: O[K],
    constraints?: Constraints,
  ): this {
    this.outputs[name] = new Port(socket, constraints);
    return this;
  }

  public removeInput(name: string & keyof I): boolean {
    return delete this.inputs[name];
  }

  public removeOutput(name: string & keyof O): boolean {
    return delete this.outputs[name];
  }
}
