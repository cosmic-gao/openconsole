import type { Neighbors, NodeId } from '../types';
import { Dfs } from '../visitors';

export function* dfs<G extends Neighbors>(
  graph: G,
  start: NodeId,
): Generator<NodeId, void, unknown> {
  yield* Dfs.start(graph, start).iterator(graph);
}
