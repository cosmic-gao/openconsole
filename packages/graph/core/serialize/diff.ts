/**
 * 图 diff / apply / invert：把两图差异表达为可应用的操作序列，支持撤销重做。
 */

import { Graph } from '../classic';
import { dumpEdge, dumpNode, loadEdge, loadNode, sameWeight } from './internal';
import type { GraphOp, GraphPatch } from './ops';
import { mergeLookup, type SocketLookup } from './sockets';

export type {
  AddEdge,
  AddNode,
  GraphOp,
  GraphPatch,
  RemoveEdge,
  RemoveNode,
  ReweightEdge,
  ReweightNode,
} from './ops';

/** {@link diff} 选项。 */
export interface DiffOptions {
  /**
   * 权重等价回调；默认采用 `===` + JSON 浅比较（详见 {@link sameWeight}）。
   *
   * @remarks
   * 当节点 / 边权重为复杂对象、Map、循环引用或函数时，默认 JSON 比较不准确。
   * 此时传入自定义 `equals` 函数，例如 `lodash.isEqual`。
   */
  equals?: <T>(a: T | undefined, b: T | undefined) => boolean;
}

/**
 * 计算把 `before` 转换为 `after` 所需的最小操作序列。
 *
 * @remarks
 * 输出顺序保证 {@link apply} 可以安全顺序执行：
 * 1. `removeEdge` — 先解开旧边
 * 2. `removeNode` — 再删除旧节点（此时其入/出边已清空）
 * 3. `addNode` + `setNodeWeight` — 加入新节点 / 更新留存节点的权重（合并扫描）
 * 4. `addEdge` + `setEdgeWeight` — 挂上新边 / 更新留存边的权重（合并扫描）
 *
 * 比较权重默认使用 {@link sameWeight}；如需自定义可通过 {@link DiffOptions.equals} 注入。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 * @param before 基准图
 * @param after 目标图
 * @param options 可选：自定义 `equals` 比较器
 * @returns 操作序列
 */
export function diff<N, E>(
  before: Graph<N, E>,
  after: Graph<N, E>,
  options?: DiffOptions,
): GraphPatch<N, E> {
  const eq = options?.equals ?? sameWeight;
  const ops: GraphOp<N, E>[] = [];

  // 1. 删除 before 中存在但 after 中不存在的边
  for (const [edgeId, edge] of before.edges) {
    if (!after.edges.has(edgeId)) {
      ops.push({ kind: 'removeEdge', data: dumpEdge(edge) });
    }
  }

  // 2. 删除 before 中存在但 after 中不存在的节点
  for (const [nodeId, node] of before.nodes) {
    if (!after.nodes.has(nodeId)) {
      ops.push({ kind: 'removeNode', data: dumpNode(node) });
    }
  }

  // 3. 节点：新增 → 加；留存且权重变 → 更新（合并原 pass 3+4）
  for (const [nodeId, afterNode] of after.nodes) {
    const beforeNode = before.nodes.get(nodeId);
    if (!beforeNode) {
      ops.push({ kind: 'addNode', data: dumpNode(afterNode) });
    } else if (!eq(beforeNode.weight, afterNode.weight)) {
      ops.push({
        kind: 'setNodeWeight',
        id: nodeId,
        from: beforeNode.weight,
        to: afterNode.weight,
      });
    }
  }

  // 4. 边：新增 → 加；留存且权重变 → 更新（合并原 pass 5+6）
  for (const [edgeId, afterEdge] of after.edges) {
    const beforeEdge = before.edges.get(edgeId);
    if (!beforeEdge) {
      ops.push({ kind: 'addEdge', data: dumpEdge(afterEdge) });
    } else if (!eq(beforeEdge.weight, afterEdge.weight)) {
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
 * @param options 反序列化选项
 * @param options.sockets 自定义 Socket 表；`addNode` 重建端口时使用
 */
export function apply<N, E>(
  graph: Graph<N, E>,
  patch: GraphPatch<N, E>,
  options?: { sockets?: SocketLookup },
): void {
  const sockets = mergeLookup(options?.sockets);
  for (const op of patch.ops) {
    switch (op.kind) {
      case 'removeEdge':
        graph.removeEdge(op.data.id);
        break;
      case 'removeNode':
        graph.removeNode(op.data.id);
        break;
      case 'addNode':
        graph.addNode(loadNode(op.data, sockets));
        break;
      case 'addEdge':
        graph.addEdge(loadEdge(graph, op.data));
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
 * 反转 patch — 把 `add ↔ remove`、`weight from/to` 互换，用于撤销 / 重做。
 *
 * @remarks
 * `apply(g, invert(diff(a, b)))` 等价于把 `g` 从 `b` 状态变回 `a` 状态
 * （假定 `g` 当前是 `b` 形态）。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 * @param patch 原始操作序列
 * @returns 反向操作序列
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
