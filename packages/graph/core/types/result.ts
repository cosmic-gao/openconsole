import type { EdgeId, GraphId, NodeId, PortId } from './brand';

export interface Cycles {
  hasCycle: boolean;
  cycleNodes: NodeId[];
}

export interface Topology {
  order: NodeId[];
  cycles: Cycles;
}

export interface JsonNode<W = unknown> {
  readonly id: NodeId;
  readonly weight: W | undefined;
  readonly inputs: Record<string, { id: PortId; socket: string } | null>;
  readonly outputs: Record<string, { id: PortId; socket: string } | null>;
}

export interface JsonEdge<W = unknown> {
  readonly id: EdgeId;
  readonly source: { readonly nodeId: NodeId; readonly portId: PortId };
  readonly target: { readonly nodeId: NodeId; readonly portId: PortId };
  readonly weight: W | undefined;
}

export interface GraphJson<N = unknown, E = unknown> {
  readonly id: GraphId;
  readonly nodes: ReadonlyArray<JsonNode<N>>;
  readonly edges: ReadonlyArray<JsonEdge<E>>;
}
