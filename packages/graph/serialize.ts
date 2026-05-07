/**
 * 序列化压缩模块
 *
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
  /** 节点 ID */
  NodeId,
  /** 节点权重 */
  unknown,
  /** 输入端口数组（无端口时为 null） */
  ReadonlyArray<[string, PortId, string]> | null,
  /** 输出端口数组（无端口时为 null） */
  ReadonlyArray<[string, PortId, string]> | null,
];

/** 边压缩元组。 */
export type CompactEdge = [
  /** 边 ID */
  EdgeId,
  /** 源节点 ID */
  NodeId,
  /** 源端口 ID */
  PortId,
  /** 目标节点 ID */
  NodeId,
  /** 目标端口 ID */
  PortId,
  /** 边权重 */
  unknown,
];

/** 整图压缩格式。 */
export interface Compact {
  /** 图 ID */
  g: GraphId;
  /** 节点数组 */
  n: CompactNode[];
  /** 边数组 */
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

/**
 * 将图序列化为压缩格式（可用于 `JSON.stringify`）。
 *
 * 相比 {@link Graph.toJson}，压缩格式可以减少约 60-70% 的字节数，
 * 适用于大规模图的持久化和网络传输。
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
 * @param data 压缩格式数据
 * @param options.target 现有图实例 - 提供时会先 `clear()` 再加载
 * @param options.sockets 自定义 Socket 查找；同名时覆盖内置 Socket
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

function packNode(node: StoredNode<unknown>): CompactNode {
  const inputs: [string, PortId, string][] = [];
  for (const [name, port] of Object.entries(node.inputs)) {
    if (!port) continue;
    inputs.push([name, port.id, port.socket.name]);
  }

  const outputs: [string, PortId, string][] = [];
  for (const [name, port] of Object.entries(node.outputs)) {
    if (!port) continue;
    outputs.push([name, port.id, port.socket.name]);
  }

  return [
    node.id,
    node.weight,
    inputs.length > 0 ? inputs : null,
    outputs.length > 0 ? outputs : null,
  ];
}

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

function unpackNode(
  data: CompactNode,
  lookup: ReadonlyMap<string, Socket>,
): StoredNode<unknown> {
  const [id, weight, inputs, outputs] = data;
  const node = new Node(id, weight) as StoredNode<unknown>;

  if (inputs) {
    for (const [name, portId, socketName] of inputs) {
      node.addInput(name, lookup.get(socketName) ?? Socket.any, portId);
    }
  }
  if (outputs) {
    for (const [name, portId, socketName] of outputs) {
      node.addOutput(name, lookup.get(socketName) ?? Socket.any, portId);
    }
  }

  return node;
}

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

/** 计算字符串的 UTF-8 字节长度（无 `TextEncoder` 依赖）。 */
function utf8ByteLength(s: string): number {
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
