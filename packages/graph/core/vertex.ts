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

/** 按名称索引的端口集合。 */
export type Ports = Readonly<Record<string, Port | undefined>>;

/**
 * 按 Socket 集合定型的端口声明，{@link Ports} 的带类型版本：端口名取自 `S` 的键，
 * 每个端口的 Socket 类型也随之定死。{@link Vertex.inputs} / {@link Vertex.outputs} 即此形态。
 */
export type Declared<S extends Sockets> = { [K in keyof S]?: Port<S[K]> };

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

  /**
   * 摘掉一个输入端口声明；端口本来就不存在时无事发生。
   *
   * @remarks 与 `addInput` 一样返回 `this` 以便链式调用。刻意不返回"是否真的删掉了"：
   *   `delete` 对不存在的属性同样给 `true`，那个布尔值恒真、不携带任何信息。
   */
  public removeInput(name: string & keyof I): this {
    delete this.inputs[name];
    return this;
  }

  /** 摘掉一个输出端口声明，语义同 {@link Vertex.removeInput}。 */
  public removeOutput(name: string & keyof O): this {
    delete this.outputs[name];
    return this;
  }
}
