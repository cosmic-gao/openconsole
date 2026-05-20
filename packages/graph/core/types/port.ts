/**
 * 端口字典派生类型：Sockets 形态 → Inputs/Outputs/Node/Ports。
 */

import type { Input, Vertex, Output, Port, Socket } from '../classic';

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
 * 图存储面的节点形态：把 {@link Vertex} 的 Sockets 泛型擦除为通用 {@link Sockets}，
 * 仅保留权重 `W`，使 `Graph<N, E>` 可无差别容纳任意端口形态的节点。
 *
 * @remarks
 * 配对关系：
 * - {@link Vertex}`<I, O, W>`：用户面构造类，保留具体 socket 类型契约（端口连接编译期校验）；
 * - `Node<W>`：存储面别名，等价于 `Vertex<Sockets, Sockets, W>`。
 *
 * 同一个实例在 TS 类型上两种视角自由切换 —— 用户调用 `addNode(vertex)` 时传入 {@link Vertex}，
 * 一旦入图就以 `Node` 形态存于 `Graph.nodes` Map。
 *
 * @template W 节点数据载荷类型
 */
export type Node<W = unknown> = Vertex<Sockets, Sockets, W>;

/**
 * 端口集合的抽象形态 —— 端口名 → 端口实例的字典，供底层算法 / 序列化遍历。
 *
 * @remarks 与具名字典 {@link Inputs}`<I>` / {@link Outputs}`<O>` 的区别：本类型不绑定
 *   具体 Sockets 形态，仅按端口的运行时类型 `P` 参数化，便于复用端口处理逻辑。
 *
 * @template P 端口具体类型
 */
export type Ports<P extends Port = Port> = { readonly [key: string]: P | undefined };
