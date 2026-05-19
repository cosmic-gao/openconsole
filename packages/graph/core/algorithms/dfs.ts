/**
 * dfs：DFS 生成器（迭代版，支持延迟消费）。
 *
 * @remarks 实现委托给 {@link Dfs} 状态化遍历器；本函数仅提供 Generator 风格的便捷入口。
 */

import type { Neighbors, NodeId } from '../types';
import { Dfs } from '../visitors';

/**
 * DFS 生成器（迭代版，支持延迟消费）。
 *
 * @template G 实现 {@link Neighbors} 的图类型
 * @param graph 图实例
 * @param start 起始节点
 * @yields 按 DFS 顺序访问到的节点 ID
 */
export function* dfs<G extends Neighbors>(
  graph: G,
  start: NodeId,
): Generator<NodeId, void, unknown> {
  yield* Dfs.start(graph, start).iterator(graph);
}
