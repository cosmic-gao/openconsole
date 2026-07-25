import type { Edge } from "../model";
import type { JsonEdge, JsonNode, Node } from "../types";
import { portsJson } from "./port";

/** 把节点导出为 JSON 形态；`Graph.toJSON` 与结构化 diff 共用。 */
export function dumpNode<N>(node: Node<N>): JsonNode<N> {
  return {
    id: node.id,
    weight: node.weight,
    inputs: portsJson(node.inputs),
    outputs: portsJson(node.outputs),
  };
}

/** 把边导出为 JSON 形态；`Graph.toJSON` 与结构化 diff 共用。 */
export function dumpEdge<E>(edge: Edge<E>): JsonEdge<E> {
  return {
    id: edge.id,
    source: { nodeId: edge.source.nodeId, portId: edge.source.portId },
    target: { nodeId: edge.target.nodeId, portId: edge.target.portId },
    weight: edge.weight,
  };
}
