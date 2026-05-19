/**
 * 端口字典派生类型：Sockets 形态 → Inputs/Outputs/Vertex/PortDict。
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
 * 图中的顶点（Graph 视角下的节点形态）。
 *
 * @remarks
 * 与用户面 {@link Node}`<I, O, W>` 对应的图存储形态：
 * - 用户面 {@link Node} 保留具体的输入 / 输出 Sockets 形态以做端口连接的编译期校验；
 * - 图存储面 `Vertex<W>` 把 Sockets 泛型擦除为通用 {@link Sockets}，仅保留节点权重 `W`，
 *   使 `Graph<N, E>` 可以无差别容纳任意端口形态的节点。
 *
 * 借用图论术语：`Node` 是带强类型 socket 契约的"用户节点"，`Vertex` 是图存储意义上的"顶点"。
 *
 * @template W 节点数据载荷类型
 */
export type Vertex<W = unknown> = Node<Sockets, Sockets, W>;

/**
 * 端口字典抽象 - 给底层算法/序列化用。
 *
 * @template P 端口具体类型
 */
export type PortDict<P extends Port = Port> = { readonly [key: string]: P | undefined };
