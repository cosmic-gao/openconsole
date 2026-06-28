import type { Edge, Graph } from '../classic';
import { compactPorts } from '../internal';
import type { Node } from '../types';
import { VERSION, type Compact, type CompactEdge, type CompactNode } from './compact';

export function pack<N, E>(graph: Graph<N, E>): Compact {
  const nodes: CompactNode[] = [];
  for (const id of graph.nodes()) nodes.push(packNode(graph.node(id)!));
  const edges: CompactEdge[] = [];
  for (const id of graph.edges()) edges.push(packEdge(graph.edge(id)!));
  return { v: VERSION, g: graph.id, n: nodes, e: edges };
}

function packNode(node: Node<unknown>): CompactNode {
  return [node.id, node.weight, compactPorts(node.inputs), compactPorts(node.outputs)];
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
