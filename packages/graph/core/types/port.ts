/**
 * 端口字典派生类型：Sockets 形态 → Inputs/Outputs/StoredNode/PortDict。
 */

import type { Input, Node, Output, Port, Socket } from '../classic';

/** 节点端口名 → Socket 的映射，用于声明节点的输入/输出形态。 */
export type Sockets = { readonly [key: string]: Socket };

/**
 * 由 {@link Sockets} 推导出的输入端口字典类型。
 *
 * @template I 端口字典的 Sockets 形态
 */
export type Inputs<I extends Sockets> = { [K in keyof I]?: Input<I[K]> };

/**
 * 由 {@link Sockets} 推导出的输出端口字典类型。
 *
 * @template O 端口字典的 Sockets 形态
 */
export type Outputs<O extends Sockets> = { [K in keyof O]?: Output<O[K]> };

/**
 * Graph 内部存储节点时使用的擦除态类型。
 *
 * @remarks
 * 节点本身可保留具体的 Sockets 形态，但 Graph 不约束这些形态，因此存储层退化为 {@link Sockets}。
 *
 * @template W 节点数据载荷类型
 */
export type StoredNode<W = unknown> = Node<Sockets, Sockets, W>;

/**
 * 端口字典抽象 - 给底层算法/序列化用。
 *
 * @template P 端口具体类型
 */
export type PortDict<P extends Port = Port> = { readonly [key: string]: P | undefined };
