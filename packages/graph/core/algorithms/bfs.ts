import type { Neighbors, NodeId } from '../types';
import { Bfs } from '../visitors';

export function* bfs<G extends Neighbors>(
  graph: G,
  start: NodeId,
): Generator<NodeId, void, unknown> {
  yield* Bfs.start(graph, start).iterator(graph);
}
