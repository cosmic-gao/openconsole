import { Graph, Schema } from "../model";
import { compactPorts } from "../support";
import type { EdgeId, Node, NodeId, PortId } from "../types";
import { buildNode, linkEdge } from "./codec";
import {
  VERSION,
  type Compact,
  type CompactEdge,
  type CompactNode,
} from "./format";
import { mergeLookup, type SocketLookup } from "./sockets";

/**
 * id 映射：紧凑格式与原始 id 之间的折算。
 * 直接打包用 {@link IDENTITY}（原样保留），需要短 id 时用 {@link Intern}（重映射为整数下标）。
 */
export interface Mapping {
  node(id: NodeId): NodeId;
  port(id: PortId): PortId;
  edge(id: EdgeId): EdgeId;
}

/** 恒等映射：id 原样保留。 */
export const IDENTITY: Mapping = {
  node: (id) => id,
  port: (id) => id,
  edge: (id) => id,
};

/**
 * 内化映射：按首次出现顺序把每个 id 折算成整数下标，同时记录逆向表以便还原。
 * 下标即在 {@link Intern.nodes} / {@link Intern.ports} / {@link Intern.edges} 中的位置。
 */
export class Intern implements Mapping {
  /** 按下标排列的原始节点 id。 */
  public readonly nodes: string[] = [];
  /** 按下标排列的原始端口 id。 */
  public readonly ports: string[] = [];
  /** 按下标排列的原始边 id。 */
  public readonly edges: string[] = [];

  private readonly _nodes = new Map<string, string>();
  private readonly _ports = new Map<string, string>();
  private readonly _edges = new Map<string, string>();

  public node(id: NodeId): NodeId {
    return this._alloc(this._nodes, this.nodes, id) as NodeId;
  }

  public port(id: PortId): PortId {
    return this._alloc(this._ports, this.ports, id) as PortId;
  }

  public edge(id: EdgeId): EdgeId {
    return this._alloc(this._edges, this.edges, id) as EdgeId;
  }

  private _alloc(
    seen: Map<string, string>,
    table: string[],
    id: string,
  ): string {
    const original = String(id);
    const known = seen.get(original);
    if (known !== undefined) return known;
    const compact = String(table.length);
    seen.set(original, compact);
    table.push(original);
    return compact;
  }
}

/**
 * 打包内核：按 `order` 顺序发出节点，再发全部边与层级关系，所有 id 经 `map` 折算。
 * {@link pack} 与 {@link packRemap} 的唯一区别就是 `order` 与 `map`。
 */
export function emit<N, E>(
  graph: Graph<N, E>,
  order: Iterable<NodeId>,
  map: Mapping,
): Compact {
  // 绑定成闭包再传给 compactPorts——裸方法引用会丢掉 Intern 的 this。
  const port = (id: PortId): PortId => map.port(id);

  const n: CompactNode[] = [];
  for (const id of order) {
    const node = graph.node(id);
    if (!node) continue;
    n.push([
      map.node(node.id),
      node.weight,
      compactPorts(node.inputs, port),
      compactPorts(node.outputs, port),
    ]);
  }

  const e: CompactEdge[] = [];
  for (const edgeId of graph.edges()) {
    const edge = graph.edge(edgeId)!;
    e.push([
      map.edge(edge.id),
      map.node(edge.sourceId),
      map.port(edge.source.portId),
      map.node(edge.targetId),
      map.port(edge.target.portId),
      edge.weight,
    ]);
  }

  const h: Array<[NodeId, NodeId]> = [];
  for (const id of graph.nodes()) {
    const parent = graph.parent(id);
    if (parent !== undefined) h.push([map.node(id), map.node(parent)]);
  }

  return h.length > 0
    ? { v: VERSION, g: graph.id, n, e, h }
    : { v: VERSION, g: graph.id, n, e };
}

/**
 * 还原内核：校验版本后在一个事务里重建节点、边与层级，所有 id 经 `map` 反向折算。
 * {@link unpack} 与 {@link unpackRemap} 的唯一区别就是 `map`。
 *
 * @throws {@link Schema} 版本不匹配
 */
export function absorb<N, E>(
  data: Compact,
  map: Mapping,
  options?: { target?: Graph<N, E>; sockets?: SocketLookup },
): Graph<N, E> {
  if (data.v !== VERSION) throw new Schema(data.v, VERSION);

  const graph = options?.target ?? new Graph<N, E>(data.g);
  if (options?.target) graph.clear();
  const sockets = mergeLookup(options?.sockets);

  return graph.batch(() => {
    const nodes = new Map<NodeId, Node<unknown>>();
    for (const compact of data.n) {
      const node = buildNode(compact, sockets, map);
      nodes.set(node.id, node);
      graph.addNode(node as Node<N>);
    }
    for (const [id, source, sourcePort, target, targetPort, weight] of data.e) {
      graph.addEdge(
        linkEdge(
          (node) => nodes.get(node),
          map.edge(id),
          map.node(source),
          map.port(sourcePort),
          map.node(target),
          map.port(targetPort),
          weight as E,
        ),
      );
    }
    if (data.h) {
      for (const [child, parent] of data.h) {
        graph.setParent(map.node(child), map.node(parent));
      }
    }
    return graph;
  });
}
