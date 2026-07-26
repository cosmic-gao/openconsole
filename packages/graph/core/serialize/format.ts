import { Missing, Schema } from "../error";
import { Graph } from "../graph";
import {
  edgeId,
  nodeId,
  type EdgeId,
  type GraphId,
  type NodeId,
} from "../ident";
import { builtins, Socket } from "../socket";
import { Port, type Constraints } from "../vertex";

export const VERSION = 2 as const;

/** 端口的紧凑形态：`[名称, socket 名]`，带约束时追加第三项。 */
export type PortTuple =
  | readonly [string, string]
  | readonly [string, string, PortLimits];

/** 端口约束的紧凑形态；取缺省值的项一律省略。 */
export interface PortLimits {
  m?: false;
  r?: true;
  f?: unknown;
}

export type CompactNode<N = unknown> = readonly [
  NodeId,
  N | undefined,
  ReadonlyArray<PortTuple> | null,
  ReadonlyArray<PortTuple> | null,
];

export type CompactEdge<E = unknown> = readonly [
  EdgeId,
  NodeId,
  string,
  NodeId,
  string,
  E | undefined,
];

/** 权重类型跟着图走，因此还原时不需要任何断言。 */
export interface Compact<N = unknown, E = unknown> {
  readonly v: number;
  readonly g: GraphId;
  readonly n: ReadonlyArray<CompactNode<N>>;
  readonly e: ReadonlyArray<CompactEdge<E>>;
  readonly h?: ReadonlyArray<readonly [NodeId, NodeId]>;
}

/** 启用 intern 时的原始 id 表，下标即短 id。 */
export interface IdTable {
  readonly nodes: ReadonlyArray<string>;
  readonly edges: ReadonlyArray<string>;
}

export interface Bundle<N = unknown, E = unknown> {
  readonly compact: Compact<N, E>;
  readonly ids?: IdTable;
}

export type SocketLookup = ReadonlyMap<string, Socket> | ReadonlyArray<Socket>;

export interface PackOptions {
  /** 节点写出顺序，默认按图内顺序；传拓扑序可得到稳定输出。 */
  order?: Iterable<NodeId>;
  /** 把长 id 折算成短整数，另附还原表。 */
  intern?: boolean;
}

export interface UnpackOptions<N, E> {
  sockets?: SocketLookup;
  /** 写入已有的图（先清空）而不是新建。 */
  into?: Graph<N, E>;
  /** intern 过的数据默认还原成原始 id；置真则保留短 id。 */
  keepShortIds?: boolean;
}

/** 按首次出现顺序把 id 折算成短整数；品牌化交给 {@link nodeId} / {@link edgeId}。 */
class Interner {
  public readonly table: string[] = [];
  private readonly _seen = new Map<string, string>();

  public map(id: string): string {
    const known = this._seen.get(id);
    if (known !== undefined) return known;
    const short = String(this.table.length);
    this._seen.set(id, short);
    this.table.push(id);
    return short;
  }
}

/** 端口表 → 紧凑元组，按名称排序以便直接比较两份结构。 */
export function tuples(
  ports: Readonly<Record<string, Port | undefined>>,
): ReadonlyArray<PortTuple> | null {
  const listed: PortTuple[] = [];
  for (const name of Object.keys(ports).sort()) {
    const port = ports[name];
    if (!port) continue;
    const limits: PortLimits = {};
    if (!port.multiple) limits.m = false;
    if (port.required) limits.r = true;
    if (port.fallback !== undefined) limits.f = port.fallback;
    listed.push(
      Object.keys(limits).length > 0
        ? [name, port.socket.name, limits]
        : [name, port.socket.name],
    );
  }
  return listed.length > 0 ? listed : null;
}

export function restore(
  listed: ReadonlyArray<PortTuple> | null,
  sockets: ReadonlyMap<string, Socket>,
): Record<string, Port> {
  const ports: Record<string, Port> = {};
  for (const [name, socket, packed] of listed ?? []) {
    const constraints: Constraints = {};
    if (packed?.m === false) constraints.multiple = false;
    if (packed?.r === true) constraints.required = true;
    if (packed?.f !== undefined) constraints.fallback = packed.f;
    ports[name] = new Port(sockets.get(socket) ?? Socket.any, constraints);
  }
  return ports;
}

export function resolve(custom?: SocketLookup): ReadonlyMap<string, Socket> {
  if (!custom) return builtins;
  const merged = new Map(builtins);
  const listed = Array.isArray(custom) ? custom : [...custom.values()];
  for (const socket of listed) merged.set(socket.name, socket);
  return merged;
}

/** 短 id 反查原始 id；表与数据对不上时明确报错，而不是悄悄产出 undefined。 */
function original(
  table: ReadonlyArray<string>,
  short: string,
  kind: "node" | "edge",
): string {
  const found = table[Number(short)];
  if (found === undefined) throw new Missing(kind, short, "id table");
  return found;
}

/** 元组化紧凑格式，保留端口约束与复合层级。 */
export function pack<N, E>(
  graph: Graph<N, E>,
  options: PackOptions = {},
): Bundle<N, E> {
  const intern = options.intern === true;
  const nodeIds = new Interner();
  const edgeIds = new Interner();
  const mapNode = (id: NodeId): NodeId =>
    intern ? nodeId(nodeIds.map(id)) : id;
  const mapEdge = (id: EdgeId): EdgeId =>
    intern ? edgeId(edgeIds.map(id)) : id;

  // 全图扫描一律走 forEach* 快路径：按存储顺序直读平行数组，省掉每个元素一次 id 查表。
  const n: Array<CompactNode<N>> = [];
  if (options.order === undefined) {
    graph.forEachNode((id, weight, slot) => {
      const record = graph.nodeAt(slot)!;
      n.push([
        mapNode(id),
        weight,
        tuples(record.inputs),
        tuples(record.outputs),
      ]);
    });
  } else {
    for (const id of options.order) {
      const record = graph.node(id);
      if (!record) continue;
      n.push([
        mapNode(record.id),
        record.weight,
        tuples(record.inputs),
        tuples(record.outputs),
      ]);
    }
  }

  const e: Array<CompactEdge<E>> = [];
  graph.forEachEdge((record) => {
    e.push([
      mapEdge(record.id),
      mapNode(record.source),
      record.sourcePort,
      mapNode(record.target),
      record.targetPort,
      record.weight,
    ]);
  });

  const h: Array<readonly [NodeId, NodeId]> = [];
  graph.forEachParent((node, parent) => {
    h.push([mapNode(node), mapNode(parent)]);
  });

  const compact: Compact<N, E> =
    h.length > 0
      ? { v: VERSION, g: graph.id, n, e, h }
      : { v: VERSION, g: graph.id, n, e };
  return intern
    ? { compact, ids: { nodes: nodeIds.table, edges: edgeIds.table } }
    : { compact };
}

/** @throws {@link Schema} 版本不匹配 */
export function unpack<N, E>(
  bundle: Bundle<N, E>,
  options: UnpackOptions<N, E> = {},
): Graph<N, E> {
  const { compact, ids } = bundle;
  if (compact.v !== VERSION) throw new Schema(compact.v, VERSION);

  const revive = ids && options.keepShortIds !== true;
  const node = (id: NodeId): NodeId =>
    revive ? nodeId(original(ids.nodes, id, "node")) : id;
  const edge = (id: EdgeId): EdgeId =>
    revive ? edgeId(original(ids.edges, id, "edge")) : id;

  const sockets = resolve(options.sockets);
  const graph = options.into ?? new Graph<N, E>(compact.g);
  if (options.into) graph.clear();

  return graph.batch(() => {
    for (const [id, weight, inputs, outputs] of compact.n) {
      graph.addNode({
        id: node(id),
        weight,
        inputs: restore(inputs, sockets),
        outputs: restore(outputs, sockets),
      });
    }
    for (const [
      id,
      source,
      sourcePort,
      target,
      targetPort,
      weight,
    ] of compact.e) {
      graph.connect([node(source), sourcePort], [node(target), targetPort], {
        id: edge(id),
        weight,
      });
    }
    for (const [child, parent] of compact.h ?? []) {
      graph.setParent(node(child), node(parent));
    }
    return graph;
  });
}

/** 逐字段展开的可读形态，用作压缩率的对照基准。 */
export function expand<N, E>(graph: Graph<N, E>): unknown {
  return {
    id: graph.id,
    nodes: graph.nodes().map((id) => {
      const record = graph.node(id)!;
      const ports = (
        listed: Readonly<Record<string, Port | undefined>>,
      ): unknown =>
        Object.fromEntries(
          Object.entries(listed)
            .filter((entry): entry is [string, Port] => entry[1] !== undefined)
            .map(([name, port]) => [
              name,
              {
                socket: port.socket.name,
                multiple: port.multiple,
                required: port.required,
                fallback: port.fallback,
              },
            ]),
        );
      return {
        id: record.id,
        weight: record.weight,
        inputs: ports(record.inputs),
        outputs: ports(record.outputs),
      };
    }),
    edges: graph.edges().map((id) => graph.edge(id)),
    hierarchy: graph
      .nodes()
      .filter((id) => graph.parent(id) !== undefined)
      .map((id) => [id, graph.parent(id)]),
  };
}

const encoder = new TextEncoder();

/** 紧凑格式相对展开 JSON 的字节压缩率。 */
export function compression<N, E>(
  graph: Graph<N, E>,
): { original: number; packed: number; ratio: number } {
  const original = encoder.encode(JSON.stringify(expand(graph))).length;
  const packed = encoder.encode(JSON.stringify(pack(graph).compact)).length;
  return { original, packed, ratio: packed === 0 ? 0 : original / packed };
}
