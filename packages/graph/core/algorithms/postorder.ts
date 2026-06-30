import type { Catalog, Neighbors, NodeId } from "../types";
import { visit } from "../visitors";

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
