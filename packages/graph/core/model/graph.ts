import { dumpEdge, dumpNode, lookupPort } from "../support";
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
} from "../types";
import { Edge } from "./edge";
import { Endpoint } from "./endpoint";
import { Model } from "./model";
import { Vertex } from "./vertex";

/**
 * 有向图主容器：在 {@link Model} 之上提供邻接查询、边视图、度数、子图与序列化等只读查询能力。
 *
 * @typeParam N - 节点权重类型
 * @typeParam E - 边权重类型
 */
export class Graph<N = unknown, E = unknown> extends Model<N, E> {
  private *_edgeIds(
    node: NodeId,
    direction: Direction,
  ): IterableIterator<EdgeId> {
    const found = this._nodes.get(node);
    if (!found) return;
    const ports = direction === "input" ? found.inputs : found.outputs;
    for (const key in ports) {
      const port = ports[key];
      if (!port) continue;
      for (const id of port.edges) yield id;
    }
  }

  private *_edgesOf(
    node: NodeId,
    direction: Direction,
  ): IterableIterator<Edge<E>> {
    for (const id of this._edgeIds(node, direction)) {
      const edge = this._edges.get(id);
      if (edge) yield edge;
    }
  }

  /** 查找从 `source` 指向 `target` 的首条边，不存在返回 `undefined`。 */
  public find(source: NodeId, target: NodeId): Edge<E> | undefined {
    for (const edge of this._edgesOf(source, "output")) {
      if (edge.targetId === target) return edge;
    }
    return undefined;
  }

  /** 返回从 `source` 指向 `target` 的所有平行边。 */
  public between(source: NodeId, target: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this._edgesOf(source, "output")) {
      if (edge.targetId === target) result.push(edge);
    }
    return result;
  }

  /** 判断是否存在 `source` 到 `target` 的有向边。 */
  public adjacent(source: NodeId, target: NodeId): boolean {
    return this.find(source, target) !== undefined;
  }

  /** 返回边的两端 `[源节点, 目标节点]`，边不存在返回 `undefined`。 */
  public endpoints(edge: EdgeId): [NodeId, NodeId] | undefined {
    const found = this._edges.get(edge);
    return found ? [found.sourceId, found.targetId] : undefined;
  }

  /** 节点入度（连入边数）。 */
  public inDegree(node: NodeId): number {
    return this._degree(node, "input");
  }

  /** 节点出度（连出边数）。 */
  public outDegree(node: NodeId): number {
    return this._degree(node, "output");
  }

  /** 节点总度数（入度 + 出度）。 */
  public degree(node: NodeId): number {
    return this.inDegree(node) + this.outDegree(node);
  }

  private _degree(node: NodeId, direction: Direction): number {
    const found = this._nodes.get(node);
    if (!found) return 0;
    const ports = direction === "input" ? found.inputs : found.outputs;
    let count = 0;
    for (const key in ports) {
      const port = ports[key];
      if (port) count += port.edges.length;
    }
    return count;
  }

  /** 节点邻居（惰性）：按 `direction` 取入/出邻居，省略则同时返回两者。 */
  public *neighbors(node: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction === "input") {
      yield* this.inNeighbors(node);
      return;
    }
    if (direction === "output") {
      yield* this.outNeighbors(node);
      return;
    }
    yield* this.inNeighbors(node);
    yield* this.outNeighbors(node);
  }

  /** 入邻居：所有指向 `node` 的源节点（惰性）。 */
  public *inNeighbors(node: NodeId): Iterable<NodeId> {
    for (const edge of this._edgesOf(node, "input")) yield edge.sourceId;
  }

  /** 出邻居：所有从 `node` 指出的目标节点（惰性）。 */
  public *outNeighbors(node: NodeId): Iterable<NodeId> {
    for (const edge of this._edgesOf(node, "output")) yield edge.targetId;
  }

  /** 遍历全部边的轻量视图（惰性）。 */
  public *edgeViews(): Iterable<EdgeView<E>> {
    for (const edge of this._edges.values()) yield viewOf(edge);
  }

  /** 节点的入边视图（惰性）。 */
  public *inEdges(node: NodeId): Iterable<EdgeView<E>> {
    for (const edge of this._edgesOf(node, "input")) yield viewOf(edge);
  }

  /** 节点的出边视图（惰性）。 */
  public *outEdges(node: NodeId): Iterable<EdgeView<E>> {
    for (const edge of this._edgesOf(node, "output")) yield viewOf(edge);
  }

  /** 创建一个仅保留相同 id、无任何节点和边的空图。 */
  public emptyCopy(): Graph<N, E> {
    return new Graph<N, E>(this.id);
  }

  /**
   * 把 `source` 的节点、边与层级并入 `target`：节点端口重建（不共享实例），
   * 已存在的节点 / 边跳过不覆盖，`keep` 非空时只并入其中的节点及两端都在其中的边。
   *
   * {@link Graph.copy} / {@link Graph.subgraph} / {@link Graph.union} 共用这一条路径。
   */
  private static merge<N, E>(
    target: Graph<N, E>,
    source: Graph<N, E>,
    keep?: ReadonlySet<NodeId>,
  ): void {
    const inside = (node: NodeId): boolean =>
      keep === undefined || keep.has(node);

    target.batch(() => {
      for (const id of source.nodes()) {
        if (!inside(id) || target.hasNode(id)) continue;
        target.addNode(replicate(source.node(id)!));
      }
      for (const edgeId of source.edges()) {
        if (target.hasEdge(edgeId)) continue;
        const edge = source.edge(edgeId)!;
        if (!inside(edge.sourceId) || !inside(edge.targetId)) continue;
        target.addEdge(
          new Edge<E>(
            edge.id,
            endpointIn(target, edge.source),
            endpointIn(target, edge.target),
            edge.weight,
          ),
        );
      }
    });

    for (const id of source.nodes()) {
      if (!inside(id)) continue;
      const parent = source.parent(id);
      if (parent === undefined || !inside(parent)) continue;
      if (target.parent(id) === undefined) target.setParent(id, parent);
    }
  }

  /** 深拷贝整个图（含节点、边与层级关系）。 */
  public copy(): Graph<N, E> {
    const clone = new Graph<N, E>(this.id);
    Graph.merge(clone, this);
    return clone;
  }

  /** 导出由给定节点集合诱导的子图（仅保留两端都在集合内的边）。 */
  public subgraph(nodes: Iterable<NodeId>): Graph<N, E> {
    const result = new Graph<N, E>(this.id);
    Graph.merge(result, this, new Set(nodes));
    return result;
  }

  /** 返回本图与 `other` 的并图；重复的节点/边以本图为准、不覆盖。 */
  public union(other: Graph<N, E>): Graph<N, E> {
    const result = this.copy();
    Graph.merge(result, other);
    return result;
  }

  /** 将整图序列化为可 JSON 化的结构（节点、边、层级及端口定义）。 */
  public toJSON(): GraphJson<N, E> {
    const nodes: JsonNode<N>[] = [];
    for (const node of this._nodes.values()) nodes.push(dumpNode(node));
    const edges: JsonEdge<E>[] = [];
    for (const edge of this._edges.values()) edges.push(dumpEdge(edge));
    const hierarchy: Array<[NodeId, NodeId]> = [];
    for (const id of this._nodes.keys()) {
      const parent = this.parent(id);
      if (parent !== undefined) hierarchy.push([id, parent]);
    }
    return hierarchy.length > 0
      ? { id: this.id, nodes, edges, hierarchy }
      : { id: this.id, nodes, edges };
  }
}

function viewOf<E>(edge: Edge<E>): EdgeView<E> {
  return {
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    weight: edge.weight,
  };
}

function replicate<N>(node: Node<N>): Vertex<Sockets, Sockets, N> {
  const clone = new Vertex<Sockets, Sockets, N>(node.id, node.weight);
  for (const key in node.inputs) {
    const port = node.inputs[key];
    if (port) {
      clone.addInput(key, port.socket, {
        id: port.id,
        multiple: port.multiple,
        required: port.required,
        fallback: port.fallback,
      });
    }
  }
  for (const key in node.outputs) {
    const port = node.outputs[key];
    if (port) {
      clone.addOutput(key, port.socket, {
        id: port.id,
        multiple: port.multiple,
        required: port.required,
        fallback: port.fallback,
      });
    }
  }
  return clone;
}

function endpointIn<N, E>(graph: Graph<N, E>, endpoint: Endpoint): Endpoint {
  const node = graph.node(endpoint.nodeId)!;
  const port =
    endpoint.port.direction === "input"
      ? lookupPort(node.inputs, endpoint.portId)
      : lookupPort(node.outputs, endpoint.portId);
  return new Endpoint(node, port!);
}
