/**
 * 边校验工具：检查端点节点 / 端口归属、方向、Socket 兼容性。
 *
 * @remarks
 * 从 {@link Graph.addEdge} 抽出，便于单测与复用。所有抛出错误都自带图 ID + 边 ID
 * 上下文，调用栈定位友好。
 *
 * @internal
 */

import type { Node, NodeId, Ports } from '../types';
import type { Edge } from './edge';
import { Misdirected, Missing, SocketMismatch } from './errors';
import type { Port } from './port';

/**
 * 校验边在加入图前是否合法。
 *
 * @param edge 待加入的边
 * @param nodes 图当前持有的节点 Map（按 ID 查找）
 * @throws {Missing} 端点节点 / 端口未注册
 * @throws {Misdirected} source 不是 output、target 不是 input
 * @throws {SocketMismatch} 两端 Socket 不兼容
 */
export function validate<E>(
  edge: Edge<E>,
  nodes: ReadonlyMap<NodeId, Node<unknown>>,
): void {
  const sourcePort = edge.source.port;
  const targetPort = edge.target.port;

  // 端点必须指向当前图实际持有的 Vertex 实例；否则端口列表会被记到一个"孤儿"节点上，
  // 导致 graph.outgoing(sourceId) 等邻接查询读不到这条边。
  if (nodes.get(edge.sourceId) !== edge.source.node) {
    throw new Missing('node', edge.sourceId, `referenced by edge "${String(edge.id)}" source`);
  }
  if (nodes.get(edge.targetId) !== edge.target.node) {
    throw new Missing('node', edge.targetId, `referenced by edge "${String(edge.id)}" target`);
  }

  if (!owns(edge.source.node.outputs, sourcePort)) {
    throw new Missing('port', sourcePort.id, `not on node "${String(edge.source.nodeId)}"`);
  }
  if (!owns(edge.target.node.inputs, targetPort)) {
    throw new Missing('port', targetPort.id, `not on node "${String(edge.target.nodeId)}"`);
  }

  if (sourcePort.direction !== 'output') {
    throw new Misdirected('source', 'output', sourcePort.direction, sourcePort.id);
  }
  if (targetPort.direction !== 'input') {
    throw new Misdirected('target', 'input', targetPort.direction, targetPort.id);
  }

  if (!sourcePort.socket.matches(targetPort.socket)) {
    throw new SocketMismatch(sourcePort.socket.name, targetPort.socket.name, edge.id);
  }
}

/**
 * 用引用相等检测端口是否在节点的端口字典中注册。
 *
 * @internal
 */
function owns(ports: Ports, target: Port): boolean {
  for (const key in ports) {
    if (ports[key] === target) return true;
  }
  return false;
}
