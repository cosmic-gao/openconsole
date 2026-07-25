import { Bfs, Dfs, visit } from "../traverse";
import type { Catalog, Neighbors, NodeId } from "../types";

/**
 * 从 start 出发对图做深度优先遍历，按访问顺序惰性产出节点。
 */
export function* dfs<G extends Neighbors>(
  graph: G,
  start: NodeId,
): Generator<NodeId, void, unknown> {
  yield* Dfs.start(graph, start).iterator(graph);
}

/**
 * 从 start 出发对图做广度优先遍历，按层级访问顺序惰性产出节点。
 */
export function* bfs<G extends Neighbors>(
  graph: G,
  start: NodeId,
): Generator<NodeId, void, unknown> {
  yield* Bfs.start(graph, start).iterator(graph);
}

/**
 * 对图做深度优先遍历，按后序（节点完成时刻）返回节点序列。
 * 未指定 starts 时遍历全部节点。
 */
export function postorder<G extends Catalog & Neighbors>(
  graph: G,
  starts?: Iterable<NodeId>,
): NodeId[] {
  const order: NodeId[] = [];
  visit(graph, starts ?? null, {
    finish(event) {
      order.push(event.node);
    },
  });
  return order;
}
