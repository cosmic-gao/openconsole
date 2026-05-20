/**
 * Node / Edge ↔ JsonNode / JsonEdge 编解码（diff/apply 内部用）。
 *
 * @internal
 */

import {
  Edge,
  Endpoint,
  Graph,
  Node,
  Socket,
  type Input,
  type Output,
} from '../../classic';
import { lookupPort, portsJson } from '../../internal';
import type { JsonEdge, JsonNode, Vertex } from '../../types';

/**
 * 单个节点 → {@link JsonNode} 快照。
 *
 * @internal
 */
export function dumpNode<N>(node: Vertex<N>): JsonNode<N> {
  return {
    id: node.id,
    weight: node.weight,
    inputs: portsJson(node.inputs),
    outputs: portsJson(node.outputs),
  };
}

/**
 * 单条边 → {@link JsonEdge} 快照。
 *
 * @internal
 */
export function dumpEdge<E>(edge: Edge<E>): JsonEdge<E> {
  return {
    id: edge.id,
    source: { nodeId: edge.source.nodeId, portId: edge.source.portId },
    target: { nodeId: edge.target.nodeId, portId: edge.target.portId },
    weight: edge.weight,
  };
}

/**
 * {@link JsonNode} → 重建的 Node 实例（带端口）。
 *
 * @internal
 */
export function loadNode<N>(
  data: JsonNode<N>,
  sockets: ReadonlyMap<string, Socket>,
): Vertex<N> {
  const node = new Node(data.id, data.weight) as Vertex<N>;
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

/**
 * {@link JsonEdge} → 重建的 Edge 实例（依赖图中已有节点 + 端口）。
 *
 * @internal
 */
export function loadEdge<N, E>(graph: Graph<N, E>, data: JsonEdge<E>): Edge<E> {
  const sourceNode = graph.getNode(data.source.nodeId);
  if (!sourceNode) {
    throw new Error(
      `[diff/apply] edge "${String(data.id)}": source node "${String(data.source.nodeId)}" not found in target graph.`,
    );
  }
  const targetNode = graph.getNode(data.target.nodeId);
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

/**
 * 权重等价比较：先严格相等，再尝试 JSON 深比较（不适合循环引用或函数）。
 *
 * @remarks 详细行为见 {@link diff} 的 `@remarks` 段。
 * @internal
 */
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
