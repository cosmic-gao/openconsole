declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type NodeId = Brand<string, 'NodeId'>;
export type EdgeId = Brand<string, 'EdgeId'>;
export type PortId = Brand<string, 'PortId'>;
export type GraphId = Brand<string, 'GraphId'>;
