/**
 * GraphJson：toJson() 输出的形状描述。
 */

import type { EdgeId, GraphId, NodeId, PortId } from './brand';

/** 序列化后的节点形态。 */
export interface GraphJsonNode<W = unknown> {
  /** 节点 ID。 */
  readonly id: NodeId;
  /** 节点权重。 */
  readonly weight: W | undefined;
  /** 输入端口字典 → 端口元数据（null 表示该名字下没有端口）。 */
  readonly inputs: Record<string, { id: PortId; socket: string } | null>;
  /** 输出端口字典 → 端口元数据。 */
  readonly outputs: Record<string, { id: PortId; socket: string } | null>;
}

/** 序列化后的边形态。 */
export interface GraphJsonEdge<W = unknown> {
  /** 边 ID。 */
  readonly id: EdgeId;
  /** 起点端口引用。 */
  readonly source: { readonly nodeId: NodeId; readonly portId: PortId };
  /** 终点端口引用。 */
  readonly target: { readonly nodeId: NodeId; readonly portId: PortId };
  /** 边权重。 */
  readonly weight: W | undefined;
}

/**
 * Graph.toJson() 返回的快照对象。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export interface GraphJson<N = unknown, E = unknown> {
  /** 图 ID。 */
  readonly id: GraphId;
  /** 全部节点。 */
  readonly nodes: ReadonlyArray<GraphJsonNode<N>>;
  /** 全部边。 */
  readonly edges: ReadonlyArray<GraphJsonEdge<E>>;
}
