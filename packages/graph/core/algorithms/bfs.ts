/**
 * bfs：BFS 生成器。
 *
 * @remarks 实现委托给 {@link Bfs} 状态化遍历器；本函数仅提供 Generator 风格的便捷入口。
 */

import type { Neighbors, NodeId } from '../types';
import { Bfs } from '../visitors';

/**
 * BFS 生成器。
 *
 * @template G 实现 {@link Neighbors} 的图类型
 * @param graph 图实例
 * @param start 起始节点
 * @returns 按 BFS 顺序逐个产出节点 ID 的生成器
 */
export function* bfs<G extends Neighbors>(
  graph: G,
  start: NodeId,
): Generator<NodeId, void, unknown> {
  yield* Bfs.start(graph, start).iterator(graph);
}
