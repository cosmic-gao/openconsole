import { topology } from '../algorithms';
import { Graph, Schema } from '../classic';
import { compactPorts } from '../internal';
import type { EdgeId, Node, NodeId, PortId } from '../types';
import { VERSION, type Compact, type CompactEdge, type CompactNode } from './compact';
import { buildNode, linkEdge } from './internal';
import { mergeLookup, type SocketLookup } from './sockets';

export interface IdRemap {
  readonly nodes: ReadonlyArray<string>;
  readonly edges: ReadonlyArray<string>;
  readonly ports: ReadonlyArray<string>;
}

export interface RemappedCompact {
  readonly compact: Compact;
  readonly remap: IdRemap;
}

export function packRemap<N, E>(graph: Graph<N, E>): RemappedCompact {
  const { order: nodeOrder } = topology(graph);
  const nodeForward = new Map<string, string>();
  const portForward = new Map<string, string>();
  const edgeForward = new Map<string, string>();
  const nodes: string[] = [];
  const ports: string[] = [];
  const edges: string[] = [];
  const n: CompactNode[] = [];

  const indexPort = (id: PortId): void => {
    portForward.set(String(id), String(ports.length));
    ports.push(String(id));
  };

  for (let i = 0; i < nodeOrder.length; i++) {
    const nodeId = nodeOrder[i]!;
    const node = graph.node(nodeId);
    if (!node) continue;
    const orig = String(nodeId);
    nodeForward.set(orig, String(i));
    nodes.push(orig);
    for (const portName in node.inputs) {
      const port = node.inputs[portName];
      if (port) indexPort(port.id);
    }
    for (const portName in node.outputs) {
      const port = node.outputs[portName];
      if (port) indexPort(port.id);
    }
    n.push([
      String(i) as NodeId,
      node.weight,
      compactPorts(node.inputs, portForward),
      compactPorts(node.outputs, portForward),
    ]);
  }

  const e: CompactEdge[] = [];
  for (const edgeId of graph.edges()) {
    const edge = graph.edge(edgeId)!;
    const orig = String(edge.id);
    const compactId = String(edges.length);
    edgeForward.set(orig, compactId);
    edges.push(orig);
    e.push([
      compactId as EdgeId,
      nodeForward.get(String(edge.sourceId))! as NodeId,
      portForward.get(String(edge.source.portId))! as PortId,
      nodeForward.get(String(edge.targetId))! as NodeId,
      portForward.get(String(edge.target.portId))! as PortId,
      edge.weight,
    ]);
  }

  return {
    compact: { v: VERSION, g: graph.id, n, e },
    remap: { nodes, edges, ports },
  };
}

export function unpackRemap<N, E>(
  data: RemappedCompact,
  options?: {
    sockets?: SocketLookup;
    target?: Graph<N, E>;
    keepCompactIds?: boolean;
  },
): Graph<N, E> {
  const version = data.compact.v ?? 1;
  if (version !== VERSION) throw new Schema(version, VERSION);

  const graph = options?.target ?? new Graph<N, E>(data.compact.g);
  if (options?.target) graph.clear();

  const sockets = mergeLookup(options?.sockets);
  const keep = options?.keepCompactIds ?? false;
  const restoreNode = (id: string): NodeId =>
    keep ? (id as NodeId) : (data.remap.nodes[Number(id)] as NodeId);
  const restorePort = (id: string): PortId =>
    keep ? (id as PortId) : (data.remap.ports[Number(id)] as PortId);
  const restoreEdge = (id: string): EdgeId =>
    keep ? (id as EdgeId) : (data.remap.edges[Number(id)] as EdgeId);

  return graph.batch(() => {
    const nodeMap = new Map<NodeId, Node<unknown>>();
    for (const compact of data.compact.n) {
      const node = buildNode(compact, sockets, restoreNode, restorePort);
      nodeMap.set(node.id, node);
      graph.addNode(node as Node<N>);
    }
    for (const [eId, sNode, sPort, tNode, tPort, weight] of data.compact.e) {
      graph.addEdge(
        linkEdge(
          (n) => nodeMap.get(n),
          restoreEdge(String(eId)),
          restoreNode(String(sNode)),
          restorePort(String(sPort)),
          restoreNode(String(tNode)),
          restorePort(String(tPort)),
          weight as E,
        ),
      );
    }
    return graph;
  });
}
