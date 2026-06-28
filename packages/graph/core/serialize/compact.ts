import type { EdgeId, GraphId, NodeId, PortId } from '../types';

export type CompactNode = [
  NodeId,
  unknown,
  ReadonlyArray<[string, PortId, string]> | null,
  ReadonlyArray<[string, PortId, string]> | null,
];

export type CompactEdge = [EdgeId, NodeId, PortId, NodeId, PortId, unknown];

export const VERSION = 1 as const;

export interface Compact {
  v: number;
  g: GraphId;
  n: CompactNode[];
  e: CompactEdge[];
}
