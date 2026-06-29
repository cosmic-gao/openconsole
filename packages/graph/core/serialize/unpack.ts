import { Graph, Schema } from '../classic';
import type { Node, NodeId, PortId } from '../types';
import { VERSION, type Compact } from './compact';
import { buildNode, linkEdge } from './internal';
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
    for (const compact of data.n) {
      const node = buildNode(compact, sockets, (id) => id as NodeId, (id) => id as PortId);
      nodeMap.set(node.id, node);
      graph.addNode(node as Node<N>);
    }
    for (const [id, sNode, sPort, tNode, tPort, weight] of data.e) {
      graph.addEdge(linkEdge((n) => nodeMap.get(n), id, sNode, sPort, tNode, tPort, weight as E));
    }
    return graph;
  });
}
