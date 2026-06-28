import type { Catalog, Neighbors, NodeId } from '../types';

export function neighborhood<G extends Catalog & Neighbors>(
  graph: G,
): Map<NodeId, { predecessors: NodeId[]; successors: NodeId[] }> {
  const result = new Map<NodeId, { predecessors: NodeId[]; successors: NodeId[] }>();

  for (const nodeId of graph.nodes()) {
    result.set(nodeId, { predecessors: [], successors: [] });
  }

  for (const nodeId of graph.nodes()) {
    const info = result.get(nodeId)!;
    for (const succ of graph.outNeighbors(nodeId)) {
      info.successors.push(succ);
      const succEntry = result.get(succ);
      if (succEntry) succEntry.predecessors.push(nodeId);
    }
  }

  return result;
}
