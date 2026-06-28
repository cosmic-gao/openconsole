import { Edge, Endpoint, Graph, Socket, Vertex, type Input, type Output } from '../../classic';
import { lookupPort, portsJson } from '../../internal';
import type { JsonEdge, JsonNode, Node } from '../../types';

export function dumpNode<N>(node: Node<N>): JsonNode<N> {
  return {
    id: node.id,
    weight: node.weight,
    inputs: portsJson(node.inputs),
    outputs: portsJson(node.outputs),
  };
}

export function dumpEdge<E>(edge: Edge<E>): JsonEdge<E> {
  return {
    id: edge.id,
    source: { nodeId: edge.source.nodeId, portId: edge.source.portId },
    target: { nodeId: edge.target.nodeId, portId: edge.target.portId },
    weight: edge.weight,
  };
}

export function loadNode<N>(data: JsonNode<N>, sockets: ReadonlyMap<string, Socket>): Node<N> {
  const node = new Vertex(data.id, data.weight) as Node<N>;
  for (const name in data.inputs) {
    const port = data.inputs[name];
    if (!port) continue;
    node.addInput(name, sockets.get(port.socket) ?? Socket.any, port.id);
  }
  for (const name in data.outputs) {
    const port = data.outputs[name];
    if (!port) continue;
    node.addOutput(name, sockets.get(port.socket) ?? Socket.any, port.id);
  }
  return node;
}

export function loadEdge<N, E>(graph: Graph<N, E>, data: JsonEdge<E>): Edge<E> {
  const sourceNode = graph.node(data.source.nodeId);
  if (!sourceNode) {
    throw new Error(
      `[diff/apply] edge "${String(data.id)}": source node "${String(data.source.nodeId)}" not found in target graph.`,
    );
  }
  const targetNode = graph.node(data.target.nodeId);
  if (!targetNode) {
    throw new Error(
      `[diff/apply] edge "${String(data.id)}": target node "${String(data.target.nodeId)}" not found in target graph.`,
    );
  }
  const sourcePort = lookupPort<Output>(sourceNode.outputs, data.source.portId);
  const targetPort = lookupPort<Input>(targetNode.inputs, data.target.portId);
  if (!sourcePort || !targetPort) {
    throw new Error(`[diff/apply] edge "${String(data.id)}" references missing ports.`);
  }
  return new Edge<E>(
    data.id,
    new Endpoint(sourceNode, sourcePort),
    new Endpoint(targetNode, targetPort),
    data.weight,
  );
}

export function sameWeight<T>(a: T | undefined, b: T | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== 'object' && typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
