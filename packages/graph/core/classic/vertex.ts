import type {
  Inputs,
  NodeId,
  Outputs,
  PortId,
  PortOptions,
  Sockets,
} from "../types";
import { Input, Output } from "./port";

/**
 * 类型化端口节点：持有命名的输入/输出端口集合，并携带可选权重。
 *
 * @typeParam I - 输入端口的类型映射
 * @typeParam O - 输出端口的类型映射
 * @typeParam W - 节点权重类型
 */
export class Vertex<
  I extends Sockets = Sockets,
  O extends Sockets = Sockets,
  W = unknown,
> {
  /** 按名称索引的输入端口集合。 */
  public readonly inputs: Inputs<I> = {} as Inputs<I>;
  /** 按名称索引的输出端口集合。 */
  public readonly outputs: Outputs<O> = {} as Outputs<O>;
  /** 节点权重（可选）。 */
  public weight: W | undefined;

  public constructor(
    /** 节点唯一 id。 */
    public readonly id: NodeId,
    weight?: W,
  ) {
    this.weight = weight;
  }

  /**
   * 新增一个输入端口。
   *
   * @returns 创建的输入端口
   */
  public addInput<K extends string & keyof I>(
    name: K,
    socket: I[K],
    options?: PortOptions,
  ): Input<I[K]> {
    const portId =
      options?.id ?? (`${String(this.id)}:input:${name}` as PortId);
    const port = new Input<I[K]>(socket, portId, options);
    this.inputs[name] = port;
    return port;
  }

  /**
   * 新增一个输出端口。
   *
   * @returns 创建的输出端口
   */
  public addOutput<K extends string & keyof O>(
    name: K,
    socket: O[K],
    options?: PortOptions,
  ): Output<O[K]> {
    const portId =
      options?.id ?? (`${String(this.id)}:output:${name}` as PortId);
    const port = new Output<O[K]>(socket, portId, options);
    this.outputs[name] = port;
    return port;
  }

  /**
   * 移除指定输入端口。
   *
   * @returns 存在并移除返回 `true`，否则 `false`
   */
  public removeInput(name: string & keyof I): boolean {
    if (!(name in this.inputs)) return false;
    delete this.inputs[name];
    return true;
  }

  /**
   * 移除指定输出端口。
   *
   * @returns 存在并移除返回 `true`，否则 `false`
   */
  public removeOutput(name: string & keyof O): boolean {
    if (!(name in this.outputs)) return false;
    delete this.outputs[name];
    return true;
  }

  /** 是否存在指定名称的输入端口。 */
  public hasInput(name: string & keyof I): boolean {
    return name in this.inputs;
  }

  /** 是否存在指定名称的输出端口。 */
  public hasOutput(name: string & keyof O): boolean {
    return name in this.outputs;
  }

  /** 按名称获取输入端口，不存在返回 `undefined`。 */
  public input<K extends string & keyof I>(name: K): Input<I[K]> | undefined {
    return this.inputs[name] as Input<I[K]> | undefined;
  }

  /** 按名称获取输出端口，不存在返回 `undefined`。 */
  public output<K extends string & keyof O>(name: K): Output<O[K]> | undefined {
    return this.outputs[name] as Output<O[K]> | undefined;
  }
}
