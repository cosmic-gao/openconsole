/**
 * 名义类型工具与品牌 ID。
 *
 * @remarks 把所有品牌 ID 与 `Brand` 工具共置一处，确保所有 ID 使用同一个内部 brand symbol。
 */

declare const __brand: unique symbol;

/**
 * 在结构类型上叠加品牌标记，制造名义类型 (nominal typing)。
 *
 * @template T 底层值类型
 * @template B 品牌字符串字面量
 */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** 节点的唯一标识。 */
export type NodeId = Brand<string, 'NodeId'>;

/** 边的唯一标识。 */
export type EdgeId = Brand<string, 'EdgeId'>;

/** 端口的唯一标识。 */
export type PortId = Brand<string, 'PortId'>;

/** 图的唯一标识。 */
export type GraphId = Brand<string, 'GraphId'>;
