import { Edge, Endpoint, Graph, Socket, Vertex, type Input, type Output } from '../../classic';
import { lookupPort, portsJson } from '../../internal';
import type { EdgeId, JsonEdge, JsonNode, Node, NodeId, PortId } from '../../types';
import type { CompactNode } from '../compact';

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

export function buildNode(
  compact: CompactNode,
  sockets: ReadonlyMap<string, Socket>,
  restoreNode: (id: string) => NodeId,
  restorePort: (id: string) => PortId,
): Node<unknown> {
  const [id, weight, inputs, outputs] = compact;
  const node = new Vertex(restoreNode(String(id)), weight) as Node<unknown>;
  if (inputs) {
    for (const [name, portId, socketName] of inputs) {
      node.addInput(name, sockets.get(socketName) ?? Socket.any, restorePort(String(portId)));
    }
  }
  if (outputs) {
    for (const [name, portId, socketName] of outputs) {
      node.addOutput(name, sockets.get(socketName) ?? Socket.any, restorePort(String(portId)));
    }
  }
  return node;
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

export function linkEdge<E>(
  lookup: (id: NodeId) => Node<unknown> | undefined,
  edgeId: EdgeId,
  sourceNodeId: NodeId,
  sourcePortId: PortId,
  targetNodeId: NodeId,
  targetPortId: PortId,
  weight: E | undefined,
): Edge<E> {
  const sourceNode = lookup(sourceNodeId);
  const targetNode = lookup(targetNodeId);
  if (!sourceNode || !targetNode) {
    throw new Error(
      `edge "${String(edgeId)}" references missing nodes: ${String(sourceNodeId)} -> ${String(targetNodeId)}`,
    );
  }
  const sourcePort = lookupPort<Output>(sourceNode.outputs, sourcePortId);
  const targetPort = lookupPort<Input>(targetNode.inputs, targetPortId);
  if (!sourcePort || !targetPort) {
    throw new Error(`edge "${String(edgeId)}" references missing ports`);
  }
  return new Edge<E>(
    edgeId,
    new Endpoint(sourceNode, sourcePort),
    new Endpoint(targetNode, targetPort),
    weight,
  );
}

export function loadEdge<N, E>(graph: Graph<N, E>, data: JsonEdge<E>): Edge<E> {
  return linkEdge(
    (id) => graph.node(id),
    data.id,
    data.source.nodeId,
    data.source.portId,
    data.target.nodeId,
    data.target.portId,
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
