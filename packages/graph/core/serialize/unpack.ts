/**
 * unpack：从紧凑格式恢复完整图。
 */

import { Edge, Endpoint, Graph, Node, Socket, type Input, type Output } from '../classic';
import type { PortId, StoredNode } from '../types';
import type { Compact, CompactNode } from './compact';

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

  const nodeMap = new Map<typeof data.n[number][0], StoredNode<unknown>>();
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
