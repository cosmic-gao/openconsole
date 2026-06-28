import { Graph } from '../classic';
import { dumpEdge, dumpNode, loadEdge, loadNode, sameWeight } from './internal';
import type { GraphOp, GraphPatch } from './ops';
import { mergeLookup, type SocketLookup } from './sockets';

export type {
  AddEdge,
  AddNode,
  DropEdge,
  DropNode,
  GraphOp,
  GraphPatch,
  ReweightEdge,
  ReweightNode,
} from './ops';

export interface DiffOptions {
  equals?: <T>(a: T | undefined, b: T | undefined) => boolean;
}

export function diff<N, E>(
  before: Graph<N, E>,
  after: Graph<N, E>,
  options?: DiffOptions,
): GraphPatch<N, E> {
  const equals = options?.equals ?? sameWeight;
  const ops: GraphOp<N, E>[] = [];

  for (const edgeId of before.edges()) {
    if (!after.hasEdge(edgeId)) {
      ops.push({ kind: 'dropEdge', data: dumpEdge(before.edge(edgeId)!) });
    }
  }

  for (const nodeId of before.nodes()) {
    if (!after.hasNode(nodeId)) {
      ops.push({ kind: 'dropNode', data: dumpNode(before.node(nodeId)!) });
    }
  }

  for (const nodeId of after.nodes()) {
    const afterNode = after.node(nodeId)!;
    const beforeNode = before.node(nodeId);
    if (!beforeNode) {
      ops.push({ kind: 'addNode', data: dumpNode(afterNode) });
    } else if (!equals(beforeNode.weight, afterNode.weight)) {
      ops.push({ kind: 'setNodeWeight', id: nodeId, from: beforeNode.weight, to: afterNode.weight });
    }
  }

  for (const edgeId of after.edges()) {
    const afterEdge = after.edge(edgeId)!;
    const beforeEdge = before.edge(edgeId);
    if (!beforeEdge) {
      ops.push({ kind: 'addEdge', data: dumpEdge(afterEdge) });
    } else if (!equals(beforeEdge.weight, afterEdge.weight)) {
      ops.push({ kind: 'setEdgeWeight', id: edgeId, from: beforeEdge.weight, to: afterEdge.weight });
    }
  }

  return { ops };
}

export function apply<N, E>(
  graph: Graph<N, E>,
  patch: GraphPatch<N, E>,
  options?: { sockets?: SocketLookup },
): void {
  const sockets = mergeLookup(options?.sockets);
  for (const op of patch.ops) {
    switch (op.kind) {
      case 'dropEdge':
        graph.dropEdge(op.data.id);
        break;
      case 'dropNode':
        graph.dropNode(op.data.id);
        break;
      case 'addNode':
        graph.addNode(loadNode(op.data, sockets));
        break;
      case 'addEdge':
        graph.addEdge(loadEdge(graph, op.data));
        break;
      case 'setNodeWeight':
        if (graph.hasNode(op.id)) graph.setNodeWeight(op.id, op.to);
        break;
      case 'setEdgeWeight':
        if (graph.hasEdge(op.id)) graph.setEdgeWeight(op.id, op.to);
        break;
    }
  }
}

export function invert<N, E>(patch: GraphPatch<N, E>): GraphPatch<N, E> {
  const inverted: GraphOp<N, E>[] = [];
  for (let i = patch.ops.length - 1; i >= 0; i--) {
    const op = patch.ops[i]!;
    switch (op.kind) {
      case 'addNode':
        inverted.push({ kind: 'dropNode', data: op.data });
        break;
      case 'dropNode':
        inverted.push({ kind: 'addNode', data: op.data });
        break;
      case 'addEdge':
        inverted.push({ kind: 'dropEdge', data: op.data });
        break;
      case 'dropEdge':
        inverted.push({ kind: 'addEdge', data: op.data });
        break;
      case 'setNodeWeight':
        inverted.push({ kind: 'setNodeWeight', id: op.id, from: op.to, to: op.from });
        break;
      case 'setEdgeWeight':
        inverted.push({ kind: 'setEdgeWeight', id: op.id, from: op.to, to: op.from });
        break;
    }
  }
  return { ops: inverted };
}
