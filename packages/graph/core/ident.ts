declare const brand: unique symbol;

/** 品牌类型：在基础类型上附加唯一标记，使语义不同的 id 互不兼容。 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type NodeId = Brand<string, "NodeId">;
export type EdgeId = Brand<string, "EdgeId">;
export type GraphId = Brand<string, "GraphId">;

export const nodeId = (id: string): NodeId => id as NodeId;
export const edgeId = (id: string): EdgeId => id as EdgeId;
export const graphId = (id: string): GraphId => id as GraphId;
