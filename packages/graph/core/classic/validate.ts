/**
 * 边校验工具：检查端点节点 / 端口归属、方向、Socket 兼容性。
 *
 * @remarks
 * 从 {@link Graph.addEdge} 抽出，便于单测与复用。所有抛出错误都自带图 ID + 边 ID
 * 上下文，调用栈定位友好。
 *
 * @internal
 */

import type { NodeId, PortDict, Vertex } from '../types';
import type { Edge } from './edge';
import type { Port } from './port';

/**
 * 校验边在加入图前是否合法。
 *
 * @param graphId 图 ID（错误消息上下文）
 * @param edge 待加入的边
 * @param nodes 图当前持有的节点 Map（按 ID 查找）
 * @throws {Error} 端点节点 / 端口未注册、方向错误或 Socket 不兼容时
 */
export function validate<E>(
  graphId: unknown,
  edge: Edge<E>,
  nodes: ReadonlyMap<NodeId, Vertex<unknown>>,
): void {
  const sourcePort = edge.source.port;
  const targetPort = edge.target.port;

  // 端点必须指向当前图实际持有的 Node 实例；否则端口列表会被记到一个"孤儿"节点上，
  // 导致 graph.outgoingEdges(sourceId) 等邻接查询读不到这条边。
  if (nodes.get(edge.sourceId) !== edge.source.node) {
    throw new Error(
      `[Graph "${String(graphId)}"] addEdge "${String(edge.id)}": source endpoint references a Node that is not the one registered under id "${String(edge.sourceId)}" in this graph.`,
    );
  }
  if (nodes.get(edge.targetId) !== edge.target.node) {
    throw new Error(
      `[Graph "${String(graphId)}"] addEdge "${String(edge.id)}": target endpoint references a Node that is not the one registered under id "${String(edge.targetId)}" in this graph.`,
    );
  }

  if (!owns(edge.source.node.outputs, sourcePort)) {
    throw new Error(
      `[Graph "${String(graphId)}"] addEdge "${String(edge.id)}": source port "${String(sourcePort.id)}" not found on node "${String(edge.source.nodeId)}".`,
    );
  }
  if (!owns(edge.target.node.inputs, targetPort)) {
    throw new Error(
      `[Graph "${String(graphId)}"] addEdge "${String(edge.id)}": target port "${String(targetPort.id)}" not found on node "${String(edge.target.nodeId)}".`,
    );
  }

  if (sourcePort.direction !== 'output') {
    throw new Error(
      `[Graph "${String(graphId)}"] addEdge "${String(edge.id)}": source endpoint port "${String(sourcePort.id)}" must be an output port (got direction="${sourcePort.direction}").`,
    );
  }
  if (targetPort.direction !== 'input') {
    throw new Error(
      `[Graph "${String(graphId)}"] addEdge "${String(edge.id)}": target endpoint port "${String(targetPort.id)}" must be an input port (got direction="${targetPort.direction}").`,
    );
  }

  if (!sourcePort.socket.matches(targetPort.socket)) {
    throw new Error(
      `[Graph "${String(graphId)}"] addEdge "${String(edge.id)}": socket type "${sourcePort.socket.name}" (source) is incompatible with "${targetPort.socket.name}" (target).`,
    );
  }
}

/**
 * 用引用相等检测端口是否在节点的端口字典中注册。
 *
 * @internal
 */
function owns(ports: PortDict, target: Port): boolean {
  for (const key in ports) {
    if (ports[key] === target) return true;
  }
  return false;
}
