import type { NodeId, Walkable } from "../../types";
import { scc } from "./scc";

/**
 * 对图做缩点：把每个强连通分量收缩为一个超级节点，得到无环的凝聚图。
 * 返回各分量、节点到分量下标的映射，以及分量间的边。
 */
export function condensation<G extends Walkable>(
  graph: G,
): {
  components: NodeId[][];
  index: Map<NodeId, number>;
  edges: Array<{ from: number; to: number }>;
} {
  const components = scc(graph);
  const index = new Map<NodeId, number>();
  for (let i = 0; i < components.length; i++) {
    for (const nodeId of components[i]!) index.set(nodeId, i);
  }

  const stride = components.length;
  if (stride > 0x3ffffff) {
    throw new Error(
      `condensation: too many SCC components (${stride}) for safe stride encoding`,
    );
  }
  const seen = new Set<number>();
  const edges: Array<{ from: number; to: number }> = [];
  for (const nodeId of graph.nodes()) {
    const from = index.get(nodeId);
    if (from === undefined) continue;
    for (const neighbor of graph.outNeighbors(nodeId)) {
      const to = index.get(neighbor);
      if (to === undefined || to === from) continue;
      const key = from * stride + to;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from, to });
    }
  }

  return { components, index, edges };
}
