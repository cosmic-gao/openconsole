/**
 * 序列化压缩模块
 *
 * @remarks
 * 参考 LiteGraph.js 的数组压缩格式，显著减少序列化后的字节大小。
 *
 * 压缩格式：
 * - 节点元组：`[id, weight, inputs, outputs]`，`inputs`/`outputs` 为 `[name, portId, socketName][]` 或 `null`。
 * - 边元组：`[id, sourceNodeId, sourcePortId, targetNodeId, targetPortId, weight]`。
 */

import { Edge, Endpoint, Graph, Node, Socket } from './classic';
import type { EdgeId, GraphId, NodeId, PortId, StoredNode } from './types';
import type { Input, Output } from './classic';

/** 节点压缩元组。 */
export type CompactNode = [
  /** 节点 ID。 */
  NodeId,
  /** 节点权重。 */
  unknown,
  /** 输入端口数组（无端口时为 `null`）。 */
  ReadonlyArray<[string, PortId, string]> | null,
  /** 输出端口数组（无端口时为 `null`）。 */
  ReadonlyArray<[string, PortId, string]> | null,
];

/** 边压缩元组。 */
export type CompactEdge = [
  /** 边 ID。 */
  EdgeId,
  /** 源节点 ID。 */
  NodeId,
  /** 源端口 ID。 */
  PortId,
  /** 目标节点 ID。 */
  NodeId,
  /** 目标端口 ID。 */
  PortId,
  /** 边权重。 */
  unknown,
];

/** 整图压缩格式。 */
export interface Compact {
  /** 图 ID。 */
  g: GraphId;
  /** 节点数组。 */
  n: CompactNode[];
  /** 边数组。 */
  e: CompactEdge[];
}

/** Socket 名称查找表。 */
export type SocketLookup = ReadonlyMap<string, Socket> | ReadonlyArray<Socket>;

/** 内置 Socket 名称 → 实例的查找表。 */
const BUILTINS: ReadonlyMap<string, Socket> = new Map<string, Socket>([
  ['number', Socket.number],
  ['string', Socket.string],
  ['boolean', Socket.boolean],
  ['object', Socket.object],
  ['array', Socket.array],
  ['exec', Socket.exec],
  ['*', Socket.any],
]);

/** TextEncoder 接口（避免在仅 ES2022 lib 下引用全局类型）。 */
interface TextEncoderLike {
  encode(input: string): { length: number };
}

/** 复用的 TextEncoder 实例；环境不支持时为 `null`，回退到手算。 */
const TEXT_ENCODER: TextEncoderLike | null = (() => {
  const ctor = (globalThis as { TextEncoder?: new () => TextEncoderLike }).TextEncoder;
  return ctor ? new ctor() : null;
})();

/**
 * 将图序列化为压缩格式（可用于 `JSON.stringify`）。
 *
 * @remarks
 * 相比 {@link Graph.toJson}，压缩格式可以减少约 60-70% 的字节数，
 * 适用于大规模图的持久化和网络传输。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 * @param graph 待序列化的图
 * @returns 紧凑表示
 */
export function pack<N, E>(graph: Graph<N, E>): Compact {
  const nodes: CompactNode[] = [];
  for (const node of graph.nodes.values()) nodes.push(packNode(node));
  const edges: CompactEdge[] = [];
  for (const edge of graph.edges.values()) edges.push(packEdge(edge));
  return { g: graph.id, n: nodes, e: edges };
}

/**
 * 从压缩格式恢复完整图。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 * @param data 压缩格式数据
 * @param options 反序列化选项
 * @param options.target 现有图实例 - 提供时会先 `clear()` 再加载
 * @param options.sockets 自定义 Socket 查找；同名时覆盖内置 Socket
 * @returns 反序列化得到的图
 * @throws {Error} 当边引用了不存在的节点或端口
 */
export function unpack<N, E>(
  data: Compact,
  options?: { target?: Graph<N, E>; sockets?: SocketLookup },
): Graph<N, E> {
  const graph = options?.target ?? new Graph<N, E>(data.g);
  if (options?.target) graph.clear();

  const lookup = mergeLookup(options?.sockets);

  const nodeMap = new Map<NodeId, StoredNode<unknown>>();
  for (const nodeData of data.n) {
    const node = unpackNode(nodeData, lookup);
    nodeMap.set(node.id, node);
    graph.addNode(node as StoredNode<N>);
  }

  for (const edgeData of data.e) {
    const [id, sourceNodeId, sourcePortId, targetNodeId, targetPortId, weight] = edgeData;

    const sourceNode = nodeMap.get(sourceNodeId);
    const targetNode = nodeMap.get(targetNodeId);
    if (!sourceNode || !targetNode) {
      throw new Error(
        `Edge "${String(id)}" references missing nodes: ${String(sourceNodeId)} -> ${String(targetNodeId)}`,
      );
    }

    const sourcePort = portById<Output>(sourceNode.outputs, sourcePortId);
    const targetPort = portById<Input>(targetNode.inputs, targetPortId);
    if (!sourcePort || !targetPort) {
      throw new Error(`Edge "${String(id)}" references missing ports`);
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
}

/**
 * 估算压缩率。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 * @param graph 待评估的图
 * @returns 原始字节、压缩字节及压缩比 (`originalBytes / compressedBytes`)
 */
export function compressionRatio<N, E>(graph: Graph<N, E>): {
  originalBytes: number;
  compressedBytes: number;
  ratio: number;
} {
  const original = JSON.stringify(graph.toJson());
  const compressed = JSON.stringify(pack(graph));

  const originalBytes = utf8ByteLength(original);
  const compressedBytes = utf8ByteLength(compressed);

  return {
    originalBytes,
    compressedBytes,
    ratio: compressedBytes === 0 ? 0 : originalBytes / compressedBytes,
  };
}

// ============================================================
// 内部工具
// ============================================================

/**
 * 把单个节点压缩成 {@link CompactNode} 元组。
 *
 * @internal
 */
function packNode(node: StoredNode<unknown>): CompactNode {
  return [node.id, node.weight, packPorts(node.inputs), packPorts(node.outputs)];
}

/**
 * 把端口字典压缩成元组数组；空字典返回 `null`，与 {@link CompactNode} 的存储约定一致。
 *
 * @internal
 */
function packPorts(
  ports: { readonly [k: string]: { id: PortId; socket: Socket } | undefined },
): ReadonlyArray<[string, PortId, string]> | null {
  const result: [string, PortId, string][] = [];
  for (const [name, port] of Object.entries(ports)) {
    if (!port) continue;
    result.push([name, port.id, port.socket.name]);
  }
  return result.length > 0 ? result : null;
}

/**
 * 把单条边压缩成 {@link CompactEdge} 元组。
 *
 * @internal
 */
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

/**
 * 还原 {@link CompactNode} 元组到 {@link Node} 实例。
 *
 * @param data 压缩节点元组
 * @param lookup Socket 名 → Socket 实例的查找表
 * @internal
 */
function unpackNode(
  data: CompactNode,
  lookup: ReadonlyMap<string, Socket>,
): StoredNode<unknown> {
  const [id, weight, inputs, outputs] = data;
  const node = new Node(id, weight) as StoredNode<unknown>;
  unpackPorts(inputs, lookup, (name, socket, portId) => {
    node.addInput(name, socket, portId);
  });
  unpackPorts(outputs, lookup, (name, socket, portId) => {
    node.addOutput(name, socket, portId);
  });
  return node;
}

/**
 * 还原压缩端口数组到节点；通过 `add` 回调避免重复书写输入/输出分支。
 *
 * @internal
 */
function unpackPorts(
  ports: ReadonlyArray<[string, PortId, string]> | null,
  lookup: ReadonlyMap<string, Socket>,
  add: (name: string, socket: Socket, id: PortId) => void,
): void {
  if (!ports) return;
  for (const [name, portId, socketName] of ports) {
    add(name, lookup.get(socketName) ?? Socket.any, portId);
  }
}

/**
 * 把内置 Socket 表与用户自定义表合并；用户表同名 Socket 会覆盖内置版本。
 *
 * @internal
 */
function mergeLookup(custom?: SocketLookup): ReadonlyMap<string, Socket> {
  if (!custom) return BUILTINS;
  const merged = new Map<string, Socket>(BUILTINS);
  if (Array.isArray(custom)) {
    for (const socket of custom) merged.set(socket.name, socket);
  } else {
    for (const [name, socket] of custom as ReadonlyMap<string, Socket>) {
      merged.set(name, socket);
    }
  }
  return merged;
}

/**
 * 用引用相等在端口字典中按 ID 查找端口。
 *
 * @internal
 */
function portById<P extends { id: PortId }>(
  ports: { readonly [key: string]: P | undefined },
  portId: PortId,
): P | undefined {
  for (const key in ports) {
    const port = ports[key];
    if (port && port.id === portId) return port;
  }
  return undefined;
}

/**
 * 计算字符串的 UTF-8 字节长度。
 *
 * @remarks 优先使用 {@link TextEncoder}（O(N) 且能正确处理代理对）；不可用时回退到手算。
 *
 * @internal
 */
function utf8ByteLength(s: string): number {
  if (TEXT_ENCODER) return TEXT_ENCODER.encode(s).length;

  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code < 0xdc00 && i + 1 < s.length) {
      // 高代理 + 低代理 = 4 字节 UTF-8
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
