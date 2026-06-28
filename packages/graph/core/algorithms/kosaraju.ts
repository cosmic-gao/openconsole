import type { Catalog, Neighbors, NodeId } from '../types';
import { reversed } from '../adapters';
import { postorder } from './postorder';

export function kosaraju<G extends Catalog & Neighbors>(graph: G): NodeId[][] {
  const order = postorder(graph);
  const reversedGraph = reversed(graph);
  const components: NodeId[][] = [];
  const visited = new Set<NodeId>();

  const stack: NodeId[] = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const root = order[i]!;
    if (visited.has(root)) continue;
    const component: NodeId[] = [];
    stack.length = 0;
    stack.push(root);
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      component.push(node);
      for (const neighbor of reversedGraph.outNeighbors(node)) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }
    if (component.length > 0) components.push(component);
  }
  return components;
}
