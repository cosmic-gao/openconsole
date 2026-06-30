import type { Input, Output, Port, Socket, Vertex } from "../classic";
import type { PortId } from "./brand";

/** 端口方向：输入或输出。 */
export type Direction = "input" | "output";

/** 创建端口的可选配置。 */
export interface PortOptions {
  /** 指定端口 ID，缺省时自动生成。 */
  id?: PortId | undefined;
  /** 是否允许多重连接。 */
  multiple?: boolean | undefined;
  /** 是否为必填端口。 */
  required?: boolean | undefined;
  /** 未连接时使用的回退值。 */
  fallback?: unknown;
}

/** 套接字（socket）字典：按名称索引的类型契约集合。 */
export type Sockets = { readonly [key: string]: Socket };

/**
 * 由套接字字典派生的输入端口字典（各项可选）。
 * @typeParam I - 输入套接字字典。
 */
export type Inputs<I extends Sockets> = { [K in keyof I]?: Input<I[K]> };

/**
 * 由套接字字典派生的输出端口字典（各项可选）。
 * @typeParam O - 输出套接字字典。
 */
export type Outputs<O extends Sockets> = { [K in keyof O]?: Output<O[K]> };

/**
 * 带输入/输出端口的图节点。
 * @typeParam W - 节点权重（payload）类型。
 */
export type Node<W = unknown> = Vertex<Sockets, Sockets, W>;

/**
 * 端口字典：按名称索引的端口集合（各项可空）。
 * @typeParam P - 端口类型。
 */
export type Ports<P extends Port = Port> = {
  readonly [key: string]: P | undefined;
};
