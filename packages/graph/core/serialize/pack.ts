/**
 * pack：把图序列化为紧凑格式。
 */

import { Edge, Graph, type Socket } from '../classic';
import type { PortId, Vertex } from '../types';
import type { Compact, CompactEdge, CompactNode } from './compact';

/**
 * 将图序列化为压缩格式（可用于 `JSON.stringify`）。
 *
 * @remarks
 * 相比 {@link Graph.toJson}，压缩格式可以减少约 60-70% 的字节数，
 * 适用于大规模图的持久化和网络传输。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 * @param graph 待序列化的图
 * @returns 紧凑表示
 */
export function pack<N, E>(graph: Graph<N, E>): Compact {
  const nodes: CompactNode[] = [];
  for (const node of graph.nodes.values()) nodes.push(packNode(node));
  const edges: CompactEdge[] = [];
  for (const edge of graph.edges.values()) edges.push(packEdge(edge));
  return { g: graph.id, n: nodes, e: edges };
}

/**
 * 把单个节点压缩成 {@link CompactNode} 元组。
 *
 * @internal
 */
function packNode(node: Vertex<unknown>): CompactNode {
  return [node.id, node.weight, packPorts(node.inputs), packPorts(node.outputs)];
}

/**
 * 把端口字典压缩成元组数组；空字典返回 `null`，与 {@link CompactNode} 的存储约定一致。
 *
 * @internal
 */
function packPorts(
  ports: { readonly [k: string]: { id: PortId; socket: Socket } | undefined },
): ReadonlyArray<[string, PortId, string]> | null {
  const result: [string, PortId, string][] = [];
  for (const [name, port] of Object.entries(ports)) {
    if (!port) continue;
    result.push([name, port.id, port.socket.name]);
  }
  return result.length > 0 ? result : null;
}

/**
 * 把单条边压缩成 {@link CompactEdge} 元组。
 *
 * @internal
 */
function packEdge(edge: Edge<unknown>): CompactEdge {
  return [
    edge.id,
    edge.source.nodeId,
    edge.source.portId,
    edge.target.nodeId,
    edge.target.portId,
    edge.weight,
  ];
}
