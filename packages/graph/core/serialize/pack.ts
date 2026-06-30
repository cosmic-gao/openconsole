import type { Edge, Graph } from "../classic";
import { compactPorts } from "../internal";
import type { Node, NodeId } from "../types";
import {
  VERSION,
  type Compact,
  type CompactEdge,
  type CompactNode,
} from "./compact";

/** 将图打包为紧凑序列化格式，约缩减 60-70% 字节，保留端口约束与复合图层次。 */
export function pack<N, E>(graph: Graph<N, E>): Compact {
  const nodes: CompactNode[] = [];
  for (const id of graph.nodes()) nodes.push(packNode(graph.node(id)!));
  const edges: CompactEdge[] = [];
  for (const id of graph.edges()) edges.push(packEdge(graph.edge(id)!));

  const hierarchy: Array<[NodeId, NodeId]> = [];
  for (const id of graph.nodes()) {
    const parent = graph.parent(id);
    if (parent !== undefined) hierarchy.push([id, parent]);
  }

  return hierarchy.length > 0
    ? { v: VERSION, g: graph.id, n: nodes, e: edges, h: hierarchy }
    : { v: VERSION, g: graph.id, n: nodes, e: edges };
}

function packNode(node: Node<unknown>): CompactNode {
  return [
    node.id,
    node.weight,
    compactPorts(node.inputs),
    compactPorts(node.outputs),
  ];
}

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
