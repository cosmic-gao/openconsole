import type { Neighbors, NodeId } from "../types";
import { Dfs } from "../visitors";

/**
 * 从 start 出发对图做深度优先遍历，按访问顺序惰性产出节点。
 */
export function* dfs<G extends Neighbors>(
  graph: G,
  start: NodeId,
): Generator<NodeId, void, unknown> {
  yield* Dfs.start(graph, start).iterator(graph);
}
