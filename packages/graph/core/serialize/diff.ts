/**
 * 图 diff / apply / invert：把两图差异表达为可应用的操作序列，支持撤销重做。
 */

import {
  Edge,
  Endpoint,
  Graph,
  Node,
  Socket,
  type Input,
  type Output,
} from '../classic';
import type {
  EdgeId,
  GraphJsonEdge,
  GraphJsonNode,
  NodeId,
  PortId,
  Vertex,
} from '../types';
import { mergeLookup, type SocketLookup } from './sockets';

// ============= 操作类型 =============

/** 新增节点：携带完整端口/权重快照，确保 apply 时可独立重建节点。 */
export interface NodeAddOp<N = unknown> {
  readonly kind: 'addNode';
  readonly data: GraphJsonNode<N>;
}

/** 删除节点：携带完整快照供 {@link invert} 还原。 */
export interface NodeRemoveOp<N = unknown> {
  readonly kind: 'removeNode';
  readonly data: GraphJsonNode<N>;
}

/** 新增边：依赖目标图中已存在所需节点 + 端口（addNode 应先于 addEdge 应用）。 */
export interface EdgeAddOp<E = unknown> {
  readonly kind: 'addEdge';
  readonly data: GraphJsonEdge<E>;
}

/** 删除边。 */
export interface EdgeRemoveOp<E = unknown> {
  readonly kind: 'removeEdge';
  readonly data: GraphJsonEdge<E>;
}

/** 节点权重更新。 */
export interface NodeWeightOp<N = unknown> {
  readonly kind: 'setNodeWeight';
  readonly id: NodeId;
  readonly from: N | undefined;
  readonly to: N | undefined;
}

/** 边权重更新。 */
export interface EdgeWeightOp<E = unknown> {
  readonly kind: 'setEdgeWeight';
  readonly id: EdgeId;
  readonly from: E | undefined;
  readonly to: E | undefined;
}

/** 单一图操作。 */
export type GraphOp<N = unknown, E = unknown> =
  | NodeAddOp<N>
  | NodeRemoveOp<N>
  | EdgeAddOp<E>
  | EdgeRemoveOp<E>
  | NodeWeightOp<N>
  | EdgeWeightOp<E>;

/** 操作序列（patch）。 */
export interface GraphPatch<N = unknown, E = unknown> {
  readonly ops: ReadonlyArray<GraphOp<N, E>>;
}

// ============= 核心 API =============

/**
 * 计算把 `before` 转换为 `after` 所需的最小操作序列。
 *
 * @remarks
 * 输出顺序保证 {@link apply} 可以安全顺序执行：
 * 1. removeEdge — 先解开旧边
 * 2. removeNode — 再删除旧节点（此时其入/出边已清空）
 * 3. addNode — 再加入新节点（含端口）
 * 4. setNodeWeight — 然后更新留存节点的权重
 * 5. addEdge — 最后挂上新边（需要双端节点 + 端口已经就绪）
 * 6. setEdgeWeight — 再更新留存边的权重
 *
 * 比较权重时使用浅引用 + JSON 深比较的混合策略；如需自定义可在调用前 / 调用后处理。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 * @param before 基准图
 * @param after 目标图
 */
export function diff<N, E>(before: Graph<N, E>, after: Graph<N, E>): GraphPatch<N, E> {
  const ops: GraphOp<N, E>[] = [];

  // 1. 删除 before 中存在但 after 中不存在的边
  for (const [edgeId, edge] of before.edges) {
    if (!after.edges.has(edgeId)) {
      ops.push({ kind: 'removeEdge', data: edgeToJson(edge) });
    }
  }

  // 2. 删除 before 中存在但 after 中不存在的节点
  for (const [nodeId, node] of before.nodes) {
    if (!after.nodes.has(nodeId)) {
      ops.push({ kind: 'removeNode', data: nodeToJson(node) });
    }
  }

  // 3. 加入 after 中新增的节点
  for (const [nodeId, afterNode] of after.nodes) {
    if (!before.nodes.has(nodeId)) {
      ops.push({ kind: 'addNode', data: nodeToJson(afterNode) });
    }
  }

  // 4. 节点权重变更
  for (const [nodeId, afterNode] of after.nodes) {
    const beforeNode = before.nodes.get(nodeId);
    if (beforeNode && !sameWeight(beforeNode.weight, afterNode.weight)) {
      ops.push({
        kind: 'setNodeWeight',
        id: nodeId,
        from: beforeNode.weight,
        to: afterNode.weight,
      });
    }
  }

  // 5. 加入 after 中新增的边
  for (const [edgeId, afterEdge] of after.edges) {
    if (!before.edges.has(edgeId)) {
      ops.push({ kind: 'addEdge', data: edgeToJson(afterEdge) });
    }
  }

  // 6. 边权重变更
  for (const [edgeId, afterEdge] of after.edges) {
    const beforeEdge = before.edges.get(edgeId);
    if (beforeEdge && !sameWeight(beforeEdge.weight, afterEdge.weight)) {
      ops.push({
        kind: 'setEdgeWeight',
        id: edgeId,
        from: beforeEdge.weight,
        to: afterEdge.weight,
      });
    }
  }

  return { ops };
}

/**
 * 把 patch 应用到目标图（原地修改）。
 *
 * @remarks
 * 假定操作序列顺序合法（{@link diff} 已保证）。`apply` 触发 graph 的标准事件，
 * 因此订阅者（如 {@link IncrementalTopo}）会跟着更新。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 * @param graph 目标图（被修改）
 * @param patch 操作序列
 * @param options.sockets 自定义 Socket 表；addNode 重建端口时使用
 */
export function apply<N, E>(
  graph: Graph<N, E>,
  patch: GraphPatch<N, E>,
  options?: { sockets?: SocketLookup },
): void {
  const lookup = mergeLookup(options?.sockets);
  for (const op of patch.ops) {
    switch (op.kind) {
      case 'removeEdge':
        graph.removeEdge(op.data.id);
        break;
      case 'removeNode':
        graph.removeNode(op.data.id);
        break;
      case 'addNode':
        graph.addNode(nodeFromJson(op.data, lookup) as Vertex<N>);
        break;
      case 'addEdge':
        graph.addEdge(edgeFromJson(graph, op.data));
        break;
      case 'setNodeWeight': {
        const n = graph.getNode(op.id);
        if (n) n.weight = op.to;
        break;
      }
      case 'setEdgeWeight': {
        const e = graph.getEdge(op.id);
        if (e) e.weight = op.to;
        break;
      }
    }
  }
}

/**
 * 反转 patch — 把 `add ↔ remove`、`weight from/to` 互换，用于撤销/重做。
 *
 * @remarks
 * `apply(g, invert(diff(a, b)))` 等价于把 `g` 从 `b` 状态变回 `a` 状态（假定 g 当前是 b 形态）。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export function invert<N, E>(patch: GraphPatch<N, E>): GraphPatch<N, E> {
  const inverted: GraphOp<N, E>[] = [];
  for (let i = patch.ops.length - 1; i >= 0; i--) {
    const op = patch.ops[i]!;
    switch (op.kind) {
      case 'addNode': inverted.push({ kind: 'removeNode', data: op.data }); break;
      case 'removeNode': inverted.push({ kind: 'addNode', data: op.data }); break;
      case 'addEdge': inverted.push({ kind: 'removeEdge', data: op.data }); break;
      case 'removeEdge': inverted.push({ kind: 'addEdge', data: op.data }); break;
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

// ============= 内部助手 =============

/**
 * 单个节点 → GraphJsonNode 快照。
 *
 * @internal
 */
function nodeToJson<N>(node: Vertex<N>): GraphJsonNode<N> {
  return {
    id: node.id,
    weight: node.weight,
    inputs: portDictToJson(node.inputs),
    outputs: portDictToJson(node.outputs),
  };
}

/**
 * 单条边 → GraphJsonEdge 快照。
 *
 * @internal
 */
function edgeToJson<E>(edge: Edge<E>): GraphJsonEdge<E> {
  return {
    id: edge.id,
    source: { nodeId: edge.source.nodeId, portId: edge.source.portId },
    target: { nodeId: edge.target.nodeId, portId: edge.target.portId },
    weight: edge.weight,
  };
}

/**
 * 端口字典 → JSON 形态。
 *
 * @internal
 */
function portDictToJson(
  ports: { readonly [key: string]: { id: PortId; socket: Socket } | undefined },
): Record<string, { id: PortId; socket: string } | null> {
  const result: Record<string, { id: PortId; socket: string } | null> = {};
  for (const [name, port] of Object.entries(ports)) {
    result[name] = port ? { id: port.id, socket: port.socket.name } : null;
  }
  return result;
}

/**
 * GraphJsonNode → 重建的 Node 实例（带端口）。
 *
 * @internal
 */
function nodeFromJson<N>(
  data: GraphJsonNode<N>,
  lookup: ReadonlyMap<string, Socket>,
): Vertex<N> {
  const node = new Node(data.id, data.weight) as Vertex<N>;
  for (const [name, port] of Object.entries(data.inputs)) {
    if (!port) continue;
    node.addInput(name, lookup.get(port.socket) ?? Socket.any, port.id);
  }
  for (const [name, port] of Object.entries(data.outputs)) {
    if (!port) continue;
    node.addOutput(name, lookup.get(port.socket) ?? Socket.any, port.id);
  }
  return node;
}

/**
 * GraphJsonEdge → 重建的 Edge 实例（依赖图中已有节点 + 端口）。
 *
 * @internal
 */
function edgeFromJson<E>(graph: Graph<unknown, E>, data: GraphJsonEdge<E>): Edge<E> {
  const sourceNode = graph.getNode(data.source.nodeId);
  if (!sourceNode) {
    throw new Error(
      `[diff/apply] edge "${String(data.id)}": source node "${String(data.source.nodeId)}" not found in target graph.`,
    );
  }
  const targetNode = graph.getNode(data.target.nodeId);
  if (!targetNode) {
    throw new Error(
      `[diff/apply] edge "${String(data.id)}": target node "${String(data.target.nodeId)}" not found in target graph.`,
    );
  }
  const sourcePort = portById<Output>(sourceNode.outputs, data.source.portId);
  const targetPort = portById<Input>(targetNode.inputs, data.target.portId);
  if (!sourcePort || !targetPort) {
    throw new Error(`[diff/apply] edge "${String(data.id)}" references missing ports.`);
  }
  return new Edge<E>(
    data.id,
    new Endpoint(sourceNode, sourcePort),
    new Endpoint(targetNode, targetPort),
    data.weight,
  );
}

/**
 * 按端口 ID 在端口字典中线性查找。
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
 * 权重等价比较：先严格相等，再尝试 JSON 深比较（不适合循环引用或函数）。
 *
 * @internal
 */
function sameWeight<T>(a: T | undefined, b: T | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== 'object' && typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
