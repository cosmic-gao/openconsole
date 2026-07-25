import type {
  Inputs,
  NodeId,
  Outputs,
  PortId,
  PortOptions,
  Sockets,
} from "../types";
import { Attached } from "./errors";
import { Input, Output } from "./port";

/**
 * 类型化端口节点：持有命名的输入/输出端口集合，并携带可选权重。
 */
export class Vertex<
  I extends Sockets = Sockets,
  O extends Sockets = Sockets,
  W = unknown,
> {
  public readonly inputs: Inputs<I> = {} as Inputs<I>;
  public readonly outputs: Outputs<O> = {} as Outputs<O>;
  public weight: W | undefined;

  public constructor(
    public readonly id: NodeId,
    weight?: W,
  ) {
    this.weight = weight;
  }

  /**
   * 新增输入端口；同名端口会被覆盖。
   *
   * @throws {@link Attached} 被覆盖的同名端口仍连着边
   */
  public addInput<K extends string & keyof I>(
    name: K,
    socket: I[K],
    options?: PortOptions,
  ): Input<I[K]> {
    const previous = this.inputs[name];
    if (previous?.connected) throw new Attached(previous.id, `input "${name}"`);
    const portId =
      options?.id ?? (`${String(this.id)}:input:${name}` as PortId);
    const port = new Input<I[K]>(socket, portId, options);
    this.inputs[name] = port;
    return port;
  }

  /**
   * 新增输出端口；同名端口会被覆盖。
   *
   * @throws {@link Attached} 被覆盖的同名端口仍连着边
   */
  public addOutput<K extends string & keyof O>(
    name: K,
    socket: O[K],
    options?: PortOptions,
  ): Output<O[K]> {
    const previous = this.outputs[name];
    if (previous?.connected)
      throw new Attached(previous.id, `output "${name}"`);
    const portId =
      options?.id ?? (`${String(this.id)}:output:${name}` as PortId);
    const port = new Output<O[K]>(socket, portId, options);
    this.outputs[name] = port;
    return port;
  }

  /**
   * 移除输入端口；不存在返回 `false`。
   *
   * @throws {@link Attached} 端口仍连着边，需先断开
   */
  public removeInput(name: string & keyof I): boolean {
    const port = this.inputs[name];
    if (!(name in this.inputs)) return false;
    if (port?.connected) throw new Attached(port.id, `input "${name}"`);
    delete this.inputs[name];
    return true;
  }

  /**
   * 移除输出端口；不存在返回 `false`。
   *
   * @throws {@link Attached} 端口仍连着边，需先断开
   */
  public removeOutput(name: string & keyof O): boolean {
    const port = this.outputs[name];
    if (!(name in this.outputs)) return false;
    if (port?.connected) throw new Attached(port.id, `output "${name}"`);
    delete this.outputs[name];
    return true;
  }

  public hasInput(name: string & keyof I): boolean {
    return name in this.inputs;
  }

  public hasOutput(name: string & keyof O): boolean {
    return name in this.outputs;
  }

  public input<K extends string & keyof I>(name: K): Input<I[K]> | undefined {
    return this.inputs[name] as Input<I[K]> | undefined;
  }

  public output<K extends string & keyof O>(name: K): Output<O[K]> | undefined {
    return this.outputs[name] as Output<O[K]> | undefined;
  }
}
