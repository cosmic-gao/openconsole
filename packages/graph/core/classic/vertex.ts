/**
 * Vertex：图中的节点，携带类型化的输入/输出端口与数据载荷。
 */

import type { Inputs, NodeId, Outputs, PortId, Sockets } from '../types';
import { Input } from './input';
import { Output } from './output';

/**
 * 图中的节点。携带类型化的输入/输出端口集合，以及任意数据载荷 (`weight`)。
 *
 * @template I 输入端口的 Sockets 形态
 * @template O 输出端口的 Sockets 形态
 * @template W 节点附带的数据载荷类型
 *
 * @example
 * ```ts
 * type AddIn = { lhs: Socket<'number'>; rhs: Socket<'number'> };
 * type AddOut = { sum: Socket<'number'> };
 *
 * const adder = new Vertex<AddIn, AddOut, { label: string }>('n1' as NodeId, { label: 'add' });
 * adder.addInput('lhs', Socket.number);
 * adder.addInput('rhs', Socket.number);
 * adder.addOutput('sum', Socket.number);
 * ```
 */
export class Vertex<
  I extends Sockets = Sockets,
  O extends Sockets = Sockets,
  W = unknown,
> {
  /** 输入端口字典：键为端口名，值为 {@link Input}。 */
  public readonly inputs: Inputs<I> = {} as Inputs<I>;

  /** 输出端口字典：键为端口名，值为 {@link Output}。 */
  public readonly outputs: Outputs<O> = {} as Outputs<O>;

  /** 附带在节点上的数据载荷。 */
  public weight: W | undefined;

  /**
   * @param id 节点唯一标识
   * @param weight 节点附带的数据载荷
   */
  public constructor(public readonly id: NodeId, weight?: W) {
    this.weight = weight;
  }

  /**
   * 创建并注册一个输入端口。
   *
   * @template K 端口名（受 `I` 的键约束）
   * @param name 端口名
   * @param socket 端口的 Socket 类型
   * @param id 端口 ID；省略时按 `${nodeId}:input:${name}` 生成
   * @returns 创建好的输入端口
   */
  public addInput<K extends string & keyof I>(
    name: K,
    socket: I[K],
    id?: PortId,
  ): Input<I[K]> {
    const portId = id ?? (`${String(this.id)}:input:${name}` as PortId);
    const port = new Input<I[K]>(socket, portId);
    this.inputs[name] = port;
    return port;
  }

  /**
   * 创建并注册一个输出端口。
   *
   * @template K 端口名（受 `O` 的键约束）
   * @param name 端口名
   * @param socket 端口的 Socket 类型
   * @param id 端口 ID；省略时按 `${nodeId}:output:${name}` 生成
   * @returns 创建好的输出端口
   */
  public addOutput<K extends string & keyof O>(
    name: K,
    socket: O[K],
    id?: PortId,
  ): Output<O[K]> {
    const portId = id ?? (`${String(this.id)}:output:${name}` as PortId);
    const port = new Output<O[K]>(socket, portId);
    this.outputs[name] = port;
    return port;
  }

  /**
   * 移除指定输入端口。
   *
   * @param name 端口名
   * @returns 是否成功移除（端口原本存在则返回 `true`）
   */
  public removeInput(name: string & keyof I): boolean {
    if (!(name in this.inputs)) return false;
    delete this.inputs[name];
    return true;
  }

  /**
   * 移除指定输出端口。
   *
   * @param name 端口名
   * @returns 是否成功移除（端口原本存在则返回 `true`）
   */
  public removeOutput(name: string & keyof O): boolean {
    if (!(name in this.outputs)) return false;
    delete this.outputs[name];
    return true;
  }

  /**
   * 是否已声明指定名称的输入端口。
   *
   * @param name 端口名
   */
  public hasInput(name: string & keyof I): boolean {
    return name in this.inputs;
  }

  /**
   * 是否已声明指定名称的输出端口。
   *
   * @param name 端口名
   */
  public hasOutput(name: string & keyof O): boolean {
    return name in this.outputs;
  }

  /**
   * 按名称获取输入端口。
   *
   * @template K 端口名
   * @param name 端口名
   * @returns 端口实例；未声明时返回 `undefined`
   */
  public input<K extends string & keyof I>(name: K): Input<I[K]> | undefined {
    return this.inputs[name] as Input<I[K]> | undefined;
  }

  /**
   * 按名称获取输出端口。
   *
   * @template K 端口名
   * @param name 端口名
   * @returns 端口实例；未声明时返回 `undefined`
   */
  public output<K extends string & keyof O>(name: K): Output<O[K]> | undefined {
    return this.outputs[name] as Output<O[K]> | undefined;
  }
}
