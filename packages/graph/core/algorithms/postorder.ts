import type { Catalog, Neighbors, NodeId } from '../types';
import { visit } from '../visitors';

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
