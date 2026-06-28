import { lookupPort, portsJson } from '../internal';
import type {
  Direction,
  EdgeId,
  EdgeView,
  GraphJson,
  JsonEdge,
  JsonNode,
  Node,
  NodeId,
  Sockets,
} from '../types';
import { Edge } from './edge';
import { Endpoint } from './endpoint';
import { Model } from './model';
import { Vertex } from './vertex';

export class Graph<N = unknown, E = unknown> extends Model<N, E> {
  private *_edgeIds(node: NodeId, direction: Direction): IterableIterator<EdgeId> {
    const found = this._nodes.get(node);
    if (!found) return;
    const ports = direction === 'input' ? found.inputs : found.outputs;
    for (const key in ports) {
      const port = ports[key];
      if (!port) continue;
      for (const id of port.edges) yield id;
    }
  }

  private *_edgesOf(node: NodeId, direction: Direction): IterableIterator<Edge<E>> {
    for (const id of this._edgeIds(node, direction)) {
      const edge = this._edges.get(id);
      if (edge) yield edge;
    }
  }

  public find(source: NodeId, target: NodeId): Edge<E> | undefined {
    for (const edge of this._edgesOf(source, 'output')) {
      if (edge.targetId === target) return edge;
    }
    return undefined;
  }

  public between(source: NodeId, target: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this._edgesOf(source, 'output')) {
      if (edge.targetId === target) result.push(edge);
    }
    return result;
  }

  public adjacent(source: NodeId, target: NodeId): boolean {
    return this.find(source, target) !== undefined;
  }

  public endpoints(edge: EdgeId): [NodeId, NodeId] | undefined {
    const found = this._edges.get(edge);
    return found ? [found.sourceId, found.targetId] : undefined;
  }

  public inDegree(node: NodeId): number {
    return this._degree(node, 'input');
  }

  public outDegree(node: NodeId): number {
    return this._degree(node, 'output');
  }

  public degree(node: NodeId): number {
    return this.inDegree(node) + this.outDegree(node);
  }

  private _degree(node: NodeId, direction: Direction): number {
    const found = this._nodes.get(node);
    if (!found) return 0;
    const ports = direction === 'input' ? found.inputs : found.outputs;
    let count = 0;
    for (const key in ports) {
      const port = ports[key];
      if (port) count += port.edges.length;
    }
    return count;
  }

  public *neighbors(node: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction === 'input') {
      yield* this.inNeighbors(node);
      return;
    }
    if (direction === 'output') {
      yield* this.outNeighbors(node);
      return;
    }
    yield* this.inNeighbors(node);
    yield* this.outNeighbors(node);
  }

  public *inNeighbors(node: NodeId): Iterable<NodeId> {
    for (const edge of this._edgesOf(node, 'input')) yield edge.sourceId;
  }

  public *outNeighbors(node: NodeId): Iterable<NodeId> {
    for (const edge of this._edgesOf(node, 'output')) yield edge.targetId;
  }

  public *edgeViews(): Iterable<EdgeView<E>> {
    for (const edge of this._edges.values()) yield viewOf(edge);
  }

  public *inEdges(node: NodeId): Iterable<EdgeView<E>> {
    for (const edge of this._edgesOf(node, 'input')) yield viewOf(edge);
  }

  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    for (const edge of this._edgesOf(node, 'output')) yield viewOf(edge);
  }

  public emptyCopy(): Graph<N, E> {
    return new Graph<N, E>(this.id);
  }

  public copy(): Graph<N, E> {
    const clone = new Graph<N, E>(this.id);
    clone.batch(() => {
      for (const node of this._nodes.values()) clone.addNode(replicate(node));
      for (const edge of this._edges.values()) {
        clone.addEdge(
          new Edge<E>(
            edge.id,
            endpointIn(clone, edge.source),
            endpointIn(clone, edge.target),
            edge.weight,
          ),
        );
      }
    });
    for (const node of this._nodes.keys()) {
      const parent = this.parent(node);
      if (parent !== undefined) clone.setParent(node, parent);
    }
    return clone;
  }

  public toJSON(): GraphJson<N, E> {
    const nodes: JsonNode<N>[] = [];
    for (const node of this._nodes.values()) {
      nodes.push({
        id: node.id,
        weight: node.weight,
        inputs: portsJson(node.inputs),
        outputs: portsJson(node.outputs),
      });
    }
    const edges: JsonEdge<E>[] = [];
    for (const edge of this._edges.values()) {
      edges.push({
        id: edge.id,
        source: { nodeId: edge.source.nodeId, portId: edge.source.portId },
        target: { nodeId: edge.target.nodeId, portId: edge.target.portId },
        weight: edge.weight,
      });
    }
    return { id: this.id, nodes, edges };
  }
}

function viewOf<E>(edge: Edge<E>): EdgeView<E> {
  return { id: edge.id, source: edge.sourceId, target: edge.targetId, weight: edge.weight };
}

function replicate<N>(node: Node<N>): Vertex<Sockets, Sockets, N> {
  const clone = new Vertex<Sockets, Sockets, N>(node.id, node.weight);
  for (const key in node.inputs) {
    const port = node.inputs[key];
    if (port) clone.addInput(key, port.socket, port.id);
  }
  for (const key in node.outputs) {
    const port = node.outputs[key];
    if (port) clone.addOutput(key, port.socket, port.id);
  }
  return clone;
}

function endpointIn<N, E>(graph: Graph<N, E>, endpoint: Endpoint): Endpoint {
  const node = graph.node(endpoint.nodeId)!;
  const port =
    endpoint.port.direction === 'input'
      ? lookupPort(node.inputs, endpoint.portId)
      : lookupPort(node.outputs, endpoint.portId);
  return new Endpoint(node, port!);
}
