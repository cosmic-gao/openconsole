/**
 * postorder：DFS 后序（finish-time）遍历。
 */

import type { Catalog, Neighbors, NodeId } from '../types';
import { visit } from '../visitors';

/**
 * DFS 后序（finish-time）遍历，返回节点 ID 列表。
 *
 * @remarks
 * - 利用 {@link visit} 收集 `finish` 事件即得到后序；
 * - 后序的逆序就是 DAG 的拓扑序，常用于实现 Kosaraju SCC、构造支配树等。
 *
 * @template G 实现 {@link Catalog} + {@link Neighbors} 的图类型
 * @param graph 图实例
 * @param starts 起点序列；省略时按 `graph.nodeIds` 全图扫描
 */
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
