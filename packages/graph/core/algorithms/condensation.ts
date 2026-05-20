/**
 * condensation：缩点，把每个 SCC 折叠为超节点。
 */

import type { NodeId, Walkable } from '../types';
import { scc } from './scc';

/**
 * 缩点：把每个强连通分量折叠为一个超节点，输出对应的 DAG 描述。
 *
 * @remarks
 * 仅返回纯数据描述，不构造新的 {@link Graph} 实例；调用方可根据需要进一步建图。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @returns
 *  - `components`: 各分量数组；
 *  - `index`: 节点 → 所属分量序号；
 *  - `edges`: 分量间的有向边（已去重，无自环）。
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

  // 用 number Set 编码 (from, to) 对，避免每条候选边都做字符串拼接。
  // 编码方案：from * stride + to，其中 stride = components.length（足够区分所有分量对）。
  // 安全上界：stride² < Number.MAX_SAFE_INTEGER (2^53)，即 stride < 2^26.5 ≈ 94M。
  // 真实场景下分量数远小于此，仅极端情形需要保守 assert。
  const stride = components.length;
  if (stride > 0x3ffffff) {
    throw new Error(`condensation: too many SCC components (${stride}) for safe stride encoding`);
  }
  const seen = new Set<number>();
  const edges: Array<{ from: number; to: number }> = [];
  for (const nodeId of graph.nodeIds) {
    const from = index.get(nodeId);
    if (from === undefined) continue;
    for (const neighbor of graph.outgoingNeighbors(nodeId)) {
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
