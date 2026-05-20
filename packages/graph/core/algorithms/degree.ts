/**
 * 度数家族：degrees / sources / sinks / isolated。
 */

import type { Catalog, Degree, IntoDegree, IntoEdges, NodeId } from '../types';

/**
 * 计算所有节点的入度与出度。
 *
 * @remarks
 * 提供两个重载，由 TypeScript 在调用点选择：
 * - 快路径：图实现 {@link IntoDegree}（如 {@link Graph}），直接读取 O(N)；
 * - 慢路径：图实现 {@link IntoEdges}，枚举边计数 O(N + E)。
 *
 * 内部用 `'inDegree' in graph` 区分而非 `typeof === 'function'`，去掉 duck typing。
 *
 * @returns 节点 ID → 入/出度
 */
export function degrees<G extends Catalog & IntoDegree>(graph: G): Map<NodeId, Degree>;
export function degrees<E, G extends Catalog & IntoEdges<E>>(graph: G): Map<NodeId, Degree>;
export function degrees(
  graph: Catalog & Partial<IntoDegree> & Partial<IntoEdges<unknown>>,
): Map<NodeId, Degree> {
  const result = new Map<NodeId, Degree>();
  if ('inDegree' in graph && 'outDegree' in graph) {
    const g = graph as Catalog & IntoDegree;
    for (const nodeId of g.nodeIds) {
      result.set(nodeId, {
        inDegree: g.inDegree(nodeId),
        outDegree: g.outDegree(nodeId),
      });
    }
    return result;
  }
  const g = graph as Catalog & IntoEdges<unknown>;
  for (const nodeId of g.nodeIds) {
    result.set(nodeId, {
      inDegree: count(g.getIncoming(nodeId)),
      outDegree: count(g.getOutgoing(nodeId)),
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
