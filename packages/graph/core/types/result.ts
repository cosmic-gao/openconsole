import type { EdgeId, GraphId, NodeId, PortId } from "./brand";

/** 环检测结果：是否存在环及参与成环的节点。 */
export interface Cycles {
  /** 是否存在环。 */
  hasCycle: boolean;
  /** 参与成环的节点 ID 列表。 */
  cycleNodes: NodeId[];
}

/** 拓扑分析结果：拓扑排序顺序及环检测信息。 */
export interface Topology {
  /** 拓扑排序后的节点顺序。 */
  order: NodeId[];
  /** 环检测结果。 */
  cycles: Cycles;
}

/** 端口的序列化形态。 */
export interface JsonPort {
  /** 端口 ID。 */
  readonly id: PortId;
  /** 套接字（socket）名称。 */
  readonly socket: string;
  /** 是否允许多重连接。 */
  readonly multiple?: boolean;
  /** 是否为必填端口。 */
  readonly required?: boolean;
  /** 未连接时的回退值。 */
  readonly fallback?: unknown;
}

/**
 * 节点的序列化形态。
 * @typeParam W - 节点权重类型。
 */
export interface JsonNode<W = unknown> {
  /** 节点 ID。 */
  readonly id: NodeId;
  /** 节点权重，缺省时为 undefined。 */
  readonly weight: W | undefined;
  /** 输入端口映射（按名称索引，空位为 null）。 */
  readonly inputs: Record<string, JsonPort | null>;
  /** 输出端口映射（按名称索引，空位为 null）。 */
  readonly outputs: Record<string, JsonPort | null>;
}

/**
 * 边的序列化形态。
 * @typeParam W - 边权重类型。
 */
export interface JsonEdge<W = unknown> {
  /** 边 ID。 */
  readonly id: EdgeId;
  /** 源端点（节点 ID 与端口 ID）。 */
  readonly source: { readonly nodeId: NodeId; readonly portId: PortId };
  /** 目标端点（节点 ID 与端口 ID）。 */
  readonly target: { readonly nodeId: NodeId; readonly portId: PortId };
  /** 边权重，缺省时为 undefined。 */
  readonly weight: W | undefined;
}

/**
 * 图的完整序列化形态（含节点、边与可选层级关系）。
 * @typeParam N - 节点权重类型。
 * @typeParam E - 边权重类型。
 */
export interface GraphJson<N = unknown, E = unknown> {
  /** 图 ID。 */
  readonly id: GraphId;
  /** 节点序列化列表。 */
  readonly nodes: ReadonlyArray<JsonNode<N>>;
  /** 边序列化列表。 */
  readonly edges: ReadonlyArray<JsonEdge<E>>;
  /** 可选的父子层级关系列表，每项为 [子节点, 父节点]。 */
  readonly hierarchy?: ReadonlyArray<readonly [NodeId, NodeId]>;
}
