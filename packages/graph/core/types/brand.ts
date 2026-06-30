declare const brand: unique symbol;

/**
 * 品牌类型：在基础类型上附加唯一标记，使语义不同的 ID 互不兼容。
 * @typeParam T - 底层基础类型（如 string）。
 * @typeParam B - 品牌标记字符串。
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** 节点的唯一标识（品牌字符串）。 */
export type NodeId = Brand<string, "NodeId">;
/** 边的唯一标识（品牌字符串）。 */
export type EdgeId = Brand<string, "EdgeId">;
/** 端口的唯一标识（品牌字符串）。 */
export type PortId = Brand<string, "PortId">;
/** 图的唯一标识（品牌字符串）。 */
export type GraphId = Brand<string, "GraphId">;
