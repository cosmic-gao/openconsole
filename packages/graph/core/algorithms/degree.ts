import type { Catalog, Degree, IntoDegree, IntoEdges, NodeId } from "../types";

/**
 * 计算每个节点的入度与出度，返回节点到度数的映射。
 */
export function degrees<G extends Catalog & IntoDegree>(
  graph: G,
): Map<NodeId, Degree>;
export function degrees<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
): Map<NodeId, Degree>;
export function degrees(
  graph: Catalog & Partial<IntoDegree> & Partial<IntoEdges<unknown>>,
): Map<NodeId, Degree> {
  const result = new Map<NodeId, Degree>();
  if ("inDegree" in graph && "outDegree" in graph) {
    const g = graph as Catalog & IntoDegree;
    for (const nodeId of g.nodes()) {
      result.set(nodeId, {
        inDegree: g.inDegree(nodeId),
        outDegree: g.outDegree(nodeId),
      });
    }
    return result;
  }
  const g = graph as Catalog & IntoEdges<unknown>;
  for (const nodeId of g.nodes()) {
    result.set(nodeId, {
      inDegree: count(g.inEdges(nodeId)),
      outDegree: count(g.outEdges(nodeId)),
    });
  }
  return result;
}

/**
 * 返回所有源点（入度为 0 的节点）。
 */
export function sources<G extends Catalog & IntoDegree>(graph: G): NodeId[] {
  return pick(graph, (id) => graph.inDegree(id) === 0);
}

/**
 * 返回所有汇点（出度为 0 的节点）。
 */
export function sinks<G extends Catalog & IntoDegree>(graph: G): NodeId[] {
  return pick(graph, (id) => graph.outDegree(id) === 0);
}

/**
 * 返回所有孤立点（入度与出度均为 0 的节点）。
 */
export function isolated<G extends Catalog & IntoDegree>(graph: G): NodeId[] {
  return pick(
    graph,
    (id) => graph.inDegree(id) === 0 && graph.outDegree(id) === 0,
  );
}

function count(iterable: Iterable<unknown>): number {
  let total = 0;
  for (const _ of iterable) total++;
  return total;
}

function pick<G extends Catalog>(
  graph: G,
  predicate: (nodeId: NodeId) => boolean,
): NodeId[] {
  const result: NodeId[] = [];
  for (const nodeId of graph.nodes()) {
    if (predicate(nodeId)) result.push(nodeId);
  }
  return result;
}
