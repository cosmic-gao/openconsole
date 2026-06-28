import type { Catalog, Neighbors, NodeId } from '../types';

export function components<G extends Catalog & Neighbors>(graph: G): NodeId[][] {
  const seen = new Set<NodeId>();
  const result: NodeId[][] = [];

  for (const root of graph.nodes()) {
    if (seen.has(root)) continue;
    const component: NodeId[] = [];
    const stack: NodeId[] = [root];
    seen.add(root);
    while (stack.length > 0) {
      const node = stack.pop()!;
      component.push(node);
      for (const neighbor of graph.neighbors(node)) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    result.push(component);
  }

  return result;
}
