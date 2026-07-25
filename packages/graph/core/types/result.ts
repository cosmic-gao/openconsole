import type { EdgeId, GraphId, NodeId, PortId } from "./brand";

/** 环检测结果。 */
export interface Cycles {
  hasCycle: boolean;
  cycleNodes: NodeId[];
}

/** 拓扑分析结果：拓扑序 + 环检测。 */
export interface Topology {
  order: NodeId[];
  cycles: Cycles;
}

/** 端口的序列化形态。 */
export interface JsonPort {
  readonly id: PortId;
  readonly socket: string;
  readonly multiple?: boolean;
  readonly required?: boolean;
  readonly fallback?: unknown;
}

/** 节点的序列化形态；端口按名称索引，空位为 `null`。 */
export interface JsonNode<W = unknown> {
  readonly id: NodeId;
  readonly weight: W | undefined;
  readonly inputs: Record<string, JsonPort | null>;
  readonly outputs: Record<string, JsonPort | null>;
}

/** 边的序列化形态。 */
export interface JsonEdge<W = unknown> {
  readonly id: EdgeId;
  readonly source: { readonly nodeId: NodeId; readonly portId: PortId };
  readonly target: { readonly nodeId: NodeId; readonly portId: PortId };
  readonly weight: W | undefined;
}

/** 图的完整序列化形态。 */
export interface GraphJson<N = unknown, E = unknown> {
  readonly id: GraphId;
  readonly nodes: ReadonlyArray<JsonNode<N>>;
  readonly edges: ReadonlyArray<JsonEdge<E>>;
  /** 每项为 `[子节点, 父节点]`。 */
  readonly hierarchy?: ReadonlyArray<readonly [NodeId, NodeId]>;
}
