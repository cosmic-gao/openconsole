import { Edge, Endpoint, Graph, Schema, Socket, Vertex, type Input, type Output } from '../classic';
import { lookupPort } from '../internal';
import type { Node, NodeId, PortId } from '../types';
import { VERSION, type Compact, type CompactNode } from './compact';
import { mergeLookup, type SocketLookup } from './sockets';

export function unpack<N, E>(
  data: Compact,
  options?: { target?: Graph<N, E>; sockets?: SocketLookup },
): Graph<N, E> {
  const version = data.v ?? 1;
  if (version !== VERSION) throw new Schema(version, VERSION);

  const graph = options?.target ?? new Graph<N, E>(data.g);
  if (options?.target) graph.clear();

  const sockets = mergeLookup(options?.sockets);

  return graph.batch(() => {
    const nodeMap = new Map<NodeId, Node<unknown>>();
    for (const nodeData of data.n) {
      const node = unpackNode(nodeData, sockets);
      nodeMap.set(node.id, node);
      graph.addNode(node as Node<N>);
    }

    for (const edgeData of data.e) {
      const [id, sourceNodeId, sourcePortId, targetNodeId, targetPortId, weight] = edgeData;

      const sourceNode = nodeMap.get(sourceNodeId);
      const targetNode = nodeMap.get(targetNodeId);
      if (!sourceNode || !targetNode) {
        throw new Error(
          `edge "${String(id)}" references missing nodes: ${String(sourceNodeId)} -> ${String(targetNodeId)}`,
        );
      }

      const sourcePort = lookupPort<Output>(sourceNode.outputs, sourcePortId);
      const targetPort = lookupPort<Input>(targetNode.inputs, targetPortId);
      if (!sourcePort || !targetPort) {
        throw new Error(`edge "${String(id)}" references missing ports`);
      }

      graph.addEdge(
        new Edge<E>(
          id,
          new Endpoint(sourceNode, sourcePort),
          new Endpoint(targetNode, targetPort),
          weight as E,
        ),
      );
    }

    return graph;
  });
}

function unpackNode(data: CompactNode, sockets: ReadonlyMap<string, Socket>): Node<unknown> {
  const [id, weight, inputs, outputs] = data;
  const node = new Vertex(id, weight) as Node<unknown>;
  unpackPorts(inputs, sockets, (name, socket, portId) => {
    node.addInput(name, socket, portId);
  });
  unpackPorts(outputs, sockets, (name, socket, portId) => {
    node.addOutput(name, socket, portId);
  });
  return node;
}

function unpackPorts(
  ports: ReadonlyArray<[string, PortId, string]> | null,
  sockets: ReadonlyMap<string, Socket>,
  add: (name: string, socket: Socket, id: PortId) => void,
): void {
  if (!ports) return;
  for (const [name, portId, socketName] of ports) {
    add(name, sockets.get(socketName) ?? Socket.any, portId);
  }
}
