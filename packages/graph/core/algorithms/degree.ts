/**
 * 度数家族：degrees / sources / sinks / isolated。
 */

import type {
  Catalog,
  Degree,
  IntoDegree,
  IntoEdgeViews,
  NodeId,
} from '../types';

/**
 * 计算所有节点的入度与出度。
 *
 * @remarks 优先使用 {@link IntoDegree}（O(N)）；缺省时枚举边引用（O(N + E)）。
 *
 * @template E 边权重类型
 * @template G 至少满足 `Catalog & IntoEdgeViews<E>`，可选实现 {@link IntoDegree}。
 * @param graph 图实例
 * @returns 节点 ID → {@link Degree}
 */
export function degrees<E, G extends Catalog & IntoEdgeViews<E>>(
  graph: G,
): Map<NodeId, Degree> {
  const result = new Map<NodeId, Degree>();
  const withDegree = graph as G & Partial<IntoDegree>;

  if (typeof withDegree.inDegree === 'function' && typeof withDegree.outDegree === 'function') {
    for (const nodeId of graph.nodeIds) {
      result.set(nodeId, {
        inDegree: withDegree.inDegree(nodeId),
        outDegree: withDegree.outDegree(nodeId),
      });
    }
    return result;
  }

  for (const nodeId of graph.nodeIds) {
    result.set(nodeId, {
      inDegree: count(graph.getIncomingEdges(nodeId)),
      outDegree: count(graph.getOutgoingEdges(nodeId)),
    });
  }
  return result;
}

/**
 * 入度为 0 的源节点。
 *
 * @template G 同时满足 {@link Catalog} 与 {@link IntoDegree} 的图类型
 * @param graph 图实例
 */
export function sources<G extends Catalog & IntoDegree>(graph: G): NodeId[] {
  return pick(graph, (id) => graph.inDegree(id) === 0);
}

/**
 * 出度为 0 的汇节点。
 *
 * @template G 同时满足 {@link Catalog} 与 {@link IntoDegree} 的图类型
 * @param graph 图实例
 */
export function sinks<G extends Catalog & IntoDegree>(graph: G): NodeId[] {
  return pick(graph, (id) => graph.outDegree(id) === 0);
}

/**
 * 入度与出度均为 0 的孤立节点。
 *
 * @template G 同时满足 {@link Catalog} 与 {@link IntoDegree} 的图类型
 * @param graph 图实例
 */
export function isolated<G extends Catalog & IntoDegree>(graph: G): NodeId[] {
  return pick(graph, (id) => graph.inDegree(id) === 0 && graph.outDegree(id) === 0);
}

/**
 * 计算可迭代序列长度。
 *
 * @internal
 */
function count(iterable: Iterable<unknown>): number {
  let total = 0;
  for (const _ of iterable) total++;
  return total;
}

/**
 * 按谓词筛选节点 ID 列表；公用 {@link sources}、{@link sinks}、{@link isolated} 的扫描骨架。
 *
 * @internal
 */
function pick<G extends Catalog>(
  graph: G,
  predicate: (nodeId: NodeId) => boolean,
): NodeId[] {
  const result: NodeId[] = [];
  for (const nodeId of graph.nodeIds) {
    if (predicate(nodeId)) result.push(nodeId);
  }
  return result;
}
