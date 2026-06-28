import type { Node, NodeId, Ports } from '../types';
import type { Edge } from './edge';
import { Misdirected, Missing, SocketMismatch } from './errors';
import type { Port } from './port';

export function validate<E>(edge: Edge<E>, nodes: ReadonlyMap<NodeId, Node<unknown>>): void {
  const sourcePort = edge.source.port;
  const targetPort = edge.target.port;

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

function owns(ports: Ports, target: Port): boolean {
  for (const key in ports) {
    if (ports[key] === target) return true;
  }
  return false;
}
