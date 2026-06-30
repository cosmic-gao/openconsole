import type { Neighbors, NodeId } from "../types";
import { Bfs } from "../visitors";

/**
 * 从 start 出发对图做广度优先遍历，按层级访问顺序惰性产出节点。
 */
export function* bfs<G extends Neighbors>(
  graph: G,
  start: NodeId,
): Generator<NodeId, void, unknown> {
  yield* Bfs.start(graph, start).iterator(graph);
}
