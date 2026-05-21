/**
 * unpack：从紧凑格式恢复完整图。
 */

import { Edge, Endpoint, Graph, Schema, Vertex, Socket, type Input, type Output } from '../classic';
import { lookupPort } from '../internal';
import type { PortId, Node } from '../types';
import { VERSION, type Compact, type CompactNode } from './compact';
import { mergeLookup, type SocketLookup } from './sockets';

// 兼容旧调用：转出 SocketLookup 让外部测试 / 调用方仍可从 './unpack' 直接 import。
export type { SocketLookup };

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
  // 历史 dump 缺 v 字段时按 1 处理；未来 schema 演进必须给出兼容路径或显式 reject。
  const version = data.v ?? 1;
  if (version !== VERSION) throw new Schema(version, VERSION);

  const graph = options?.target ?? new Graph<N, E>(data.g);
  if (options?.target) graph.clear();

  const sockets = mergeLookup(options?.sockets);

  // batch 包裹大幅减少 N×事件 emit 开销，并让 IncrementalTopo 等订阅者只感知一次终态。
  return graph.batch(() => {
    const nodeMap = new Map<typeof data.n[number][0], Node<unknown>>();
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
          `Edge "${String(id)}" references missing nodes: ${String(sourceNodeId)} -> ${String(targetNodeId)}`,
        );
      }

      const sourcePort = lookupPort<Output>(sourceNode.outputs, sourcePortId);
      const targetPort = lookupPort<Input>(targetNode.inputs, targetPortId);
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
  });
}

/**
 * 还原 {@link CompactNode} 元组到 {@link Vertex} 实例。
 *
 * @param data 压缩节点元组
 * @param sockets Socket 名 → Socket 实例的查找表
 * @internal
 */
function unpackNode(
  data: CompactNode,
  sockets: ReadonlyMap<string, Socket>,
): Node<unknown> {
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

/**
 * 还原压缩端口数组到节点；通过 `add` 回调避免重复书写输入/输出分支。
 *
 * @internal
 */
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
