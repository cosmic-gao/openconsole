import { topology } from '../algorithms';
import { Edge, Endpoint, Graph, Schema, Socket, Vertex, type Input, type Output } from '../classic';
import { compactPorts, lookupPort } from '../internal';
import type { EdgeId, Node, NodeId, PortId } from '../types';
import { VERSION, type Compact, type CompactEdge, type CompactNode } from './compact';
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
  const restoreNode = (compactId: string): NodeId =>
    keep ? (compactId as NodeId) : (data.remap.nodes[Number(compactId)] as NodeId);
  const restorePort = (compactId: string): PortId =>
    keep ? (compactId as PortId) : (data.remap.ports[Number(compactId)] as PortId);
  const restoreEdge = (compactId: string): EdgeId =>
    keep ? (compactId as EdgeId) : (data.remap.edges[Number(compactId)] as EdgeId);

  return graph.batch(() => {
    const nodeMap = new Map<NodeId, Node<unknown>>();
    for (const [compactId, weight, inputs, outputs] of data.compact.n) {
      const id = restoreNode(String(compactId));
      const node = new Vertex(id, weight as N) as Node<N>;
      if (inputs) {
        for (const [name, portCompactId, socketName] of inputs) {
          node.addInput(name, sockets.get(socketName) ?? Socket.any, restorePort(String(portCompactId)));
        }
      }
      if (outputs) {
        for (const [name, portCompactId, socketName] of outputs) {
          node.addOutput(name, sockets.get(socketName) ?? Socket.any, restorePort(String(portCompactId)));
        }
      }
      nodeMap.set(id, node as Node<unknown>);
      graph.addNode(node);
    }

    for (const [eId, sNode, sPort, tNode, tPort, weight] of data.compact.e) {
      const edgeId = restoreEdge(String(eId));
      const sourceId = restoreNode(String(sNode));
      const targetId = restoreNode(String(tNode));
      const sourcePortId = restorePort(String(sPort));
      const targetPortId = restorePort(String(tPort));

      const sourceNode = nodeMap.get(sourceId);
      const targetNode = nodeMap.get(targetId);
      if (!sourceNode || !targetNode) {
        throw new Error(
          `[unpackRemap] edge "${String(edgeId)}" references missing nodes: ${String(sourceId)} -> ${String(targetId)}`,
        );
      }
      const sourcePort = lookupPort<Output>(sourceNode.outputs, sourcePortId);
      const targetPort = lookupPort<Input>(targetNode.inputs, targetPortId);
      if (!sourcePort || !targetPort) {
        throw new Error(`[unpackRemap] edge "${String(edgeId)}" references missing ports.`);
      }
      graph.addEdge(
        new Edge<E>(
          edgeId,
          new Endpoint(sourceNode, sourcePort),
          new Endpoint(targetNode, targetPort),
          weight as E,
        ),
      );
    }

    return graph;
  });
}
