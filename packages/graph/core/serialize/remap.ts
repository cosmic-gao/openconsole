/**
 * 拓扑稳定 ID 重映射：把图中所有节点/边/端口 ID 按拓扑序压成 0-based 整数短字符串。
 *
 * @remarks
 * 适用于持久化大量节点的场景：长 UUID（"node-abc-123-..."）被替换为 `"0" / "1" / ...`，
 * 显著缩小字节数；同时输出反向映射表 (`remap`)，反序列化时可还原原始 ID。
 *
 * 性质：
 * - **拓扑稳定**：节点按 {@link topology} 输出顺序编号 (DAG 时整数 ID 与拓扑序一致)；
 *   含环时环上节点按原顺序追加在尾部；
 * - **端口顺序**：按节点的拓扑序 → input 字典遍历顺序 → output 字典遍历顺序；
 * - **边顺序**：保留图内 Map 插入顺序。
 */

import { Edge, Endpoint, Graph, Vertex, Socket, type Input, type Output } from '../classic';
import { compactPorts, lookupPort } from '../internal';
import type {
  EdgeId,
  NodeId,
  PortId,
  Node,
} from '../types';
import { topology } from '../algorithms';
import type { Compact, CompactEdge, CompactNode } from './compact';
import { mergeLookup, type SocketLookup } from './sockets';

/**
 * 反向映射表：紧凑整数 ID（数组下标）→ 原始 ID 字符串。
 *
 * @remarks
 * `nodes[i]` 给出紧凑 ID `"i"` 对应的原始节点 ID；ports / edges 同理。
 */
export interface IdRemap {
  readonly nodes: ReadonlyArray<string>;
  readonly edges: ReadonlyArray<string>;
  readonly ports: ReadonlyArray<string>;
}

/** packRemap 输出：紧凑格式 + 反向映射表。 */
export interface RemappedCompact {
  readonly compact: Compact;
  readonly remap: IdRemap;
}

/**
 * 按拓扑序为节点 ID 分配 0..N-1 整数；同时为端口 / 边分配序号，输出紧凑格式与反向映射。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 * @param graph 待打包的图
 * @returns 紧凑格式 + reverse remap 表
 */
export function packRemap<N, E>(graph: Graph<N, E>): RemappedCompact {
  const { order: nodeOrder } = topology(graph);
  const nodeForward = new Map<string, string>();
  const portForward = new Map<string, string>();
  const edgeForward = new Map<string, string>();
  const nodes: string[] = [];
  const ports: string[] = [];
  const edges: string[] = [];
  const n: CompactNode[] = [];

  const indexPort = (id: PortId): void => {
    portForward.set(String(id), String(ports.length));
    ports.push(String(id));
  };

  // 1. 节点扫描：按拓扑序分配节点 ID + 端口 ID + 构造 CompactNode（合并原 pass 1+2+4 节点部分）
  for (let i = 0; i < nodeOrder.length; i++) {
    const nodeId = nodeOrder[i]!;
    const node = graph.getNode(nodeId);
    if (!node) continue;
    const orig = String(nodeId);
    nodeForward.set(orig, String(i));
    nodes.push(orig);
    for (const portName in node.inputs) {
      const port = node.inputs[portName];
      if (port) indexPort(port.id);
    }
    for (const portName in node.outputs) {
      const port = node.outputs[portName];
      if (port) indexPort(port.id);
    }
    n.push([
      String(i) as NodeId,
      node.weight,
      compactPorts(node.inputs, portForward),
      compactPorts(node.outputs, portForward),
    ]);
  }

  // 2. 边扫描：分配边 ID + 构造 CompactEdge（合并原 pass 3+4 边部分）
  const e: CompactEdge[] = [];
  for (const edge of graph.edges.values()) {
    const orig = String(edge.id);
    const compactId = String(edges.length);
    edgeForward.set(orig, compactId);
    edges.push(orig);
    e.push([
      compactId as EdgeId,
      nodeForward.get(String(edge.sourceId))! as NodeId,
      portForward.get(String(edge.source.portId))! as PortId,
      nodeForward.get(String(edge.targetId))! as NodeId,
      portForward.get(String(edge.target.portId))! as PortId,
      edge.weight,
    ]);
  }

  return {
    compact: { g: graph.id, n, e },
    remap: { nodes, edges, ports },
  };
}

/**
 * 反向解包：把 packRemap 的输出还原回原始 ID 的完整图。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 * @param data packRemap 的输出
 * @param options.sockets 自定义 Socket 表
 * @param options.target 复用现有图（先 clear 再加载）
 * @param options.keepCompactIds 保留紧凑 ID 而不还原原 ID；默认 false
 */
export function unpackRemap<N, E>(
  data: RemappedCompact,
  options?: {
    sockets?: SocketLookup;
    target?: Graph<N, E>;
    keepCompactIds?: boolean;
  },
): Graph<N, E> {
  const graph = options?.target ?? new Graph<N, E>(data.compact.g);
  if (options?.target) graph.clear();

  const sockets = mergeLookup(options?.sockets);
  const keep = options?.keepCompactIds ?? false;
  const restoreNode = (compactId: string): NodeId =>
    keep ? (compactId as NodeId) : (data.remap.nodes[Number(compactId)] as NodeId);
  const restorePort = (compactId: string): PortId =>
    keep ? (compactId as PortId) : (data.remap.ports[Number(compactId)] as PortId);
  const restoreEdge = (compactId: string): EdgeId =>
    keep ? (compactId as EdgeId) : (data.remap.edges[Number(compactId)] as EdgeId);

  // 重建节点
  const nodeMap = new Map<NodeId, Node<unknown>>();
  for (const [compactId, weight, inputs, outputs] of data.compact.n) {
    const id = restoreNode(String(compactId));
    const node = new Vertex(id, weight as N) as Node<N>;
    if (inputs) {
      for (const [name, portCompactId, socketName] of inputs) {
        node.addInput(
          name as string,
          sockets.get(socketName) ?? Socket.any,
          restorePort(String(portCompactId)),
        );
      }
    }
    if (outputs) {
      for (const [name, portCompactId, socketName] of outputs) {
        node.addOutput(
          name as string,
          sockets.get(socketName) ?? Socket.any,
          restorePort(String(portCompactId)),
        );
      }
    }
    nodeMap.set(id, node as Node<unknown>);
    graph.addNode(node);
  }

  // 重建边
  for (const [eId, sNode, sPort, tNode, tPort, weight] of data.compact.e) {
    const edgeId = restoreEdge(String(eId));
    const sourceId = restoreNode(String(sNode));
    const targetId = restoreNode(String(tNode));
    const sourcePortId = restorePort(String(sPort));
    const targetPortId = restorePort(String(tPort));

    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);
    if (!sourceNode || !targetNode) {
      throw new Error(
        `[unpackRemap] edge "${String(edgeId)}" references missing nodes: ${String(sourceId)} -> ${String(targetId)}`,
      );
    }
    const sourcePort = lookupPort<Output>(sourceNode.outputs, sourcePortId);
    const targetPort = lookupPort<Input>(targetNode.inputs, targetPortId);
    if (!sourcePort || !targetPort) {
      throw new Error(`[unpackRemap] edge "${String(edgeId)}" references missing ports.`);
    }
    graph.addEdge(
      new Edge<E>(
        edgeId,
        new Endpoint(sourceNode, sourcePort),
        new Endpoint(targetNode, targetPort),
        weight as E,
      ),
    );
  }

  return graph;
}
