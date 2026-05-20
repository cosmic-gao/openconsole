/**
 * visit：事件回调风格的 DFS（三色法）。
 */

import type { Catalog, Control, DfsEvent, Neighbors, NodeId } from '../types';

/**
 * DFS 访问者回调集合。
 *
 * @remarks
 * - 任意回调可省略；
 * - 回调返回 {@link Control} 决定遍历继续 / 剪枝 / 中止；
 * - 事件参数详见 {@link DfsEvent}。
 */
export interface DfsVisitor {
  /** 节点首次进入栈，准备访问其后继。 */
  discover?(event: DfsEvent): Control | void;
  /** 节点的所有后继都访问完毕，回溯前调用。 */
  finish?(event: DfsEvent): Control | void;
  /** 树边：从已 discover 但未 finish 的节点指向尚未 discover 的节点。 */
  treeEdge?(event: DfsEvent): Control | void;
  /** 后向边：指向当前 DFS 栈中的节点（环的指示）。 */
  backEdge?(event: DfsEvent): Control | void;
  /** 横向 / 前向边：指向已 finish 的节点。 */
  crossEdge?(event: DfsEvent): Control | void;
}

/** 节点颜色：未访问 / 在栈上 / 已完成。 */
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

/**
 * 事件回调风格的 DFS（三色法）。
 *
 * @remarks
 * - 状态：每个节点处于 `白色`（未访问）/ `灰色`（在栈上）/ `黑色`（已 finish）三态；
 * - 边事件根据邻居颜色派发为 `treeEdge` / `backEdge` / `crossEdge`；
 * - 任意回调返回 `'break'` 立即中止整次遍历并返回 `'break'`，否则返回最终的 {@link Control}。
 *
 * @template G 实现 {@link Catalog} + {@link Neighbors} 的图类型
 * @param graph 图实例
 * @param starts 起点节点序列；若省略则按 `graph.nodeIds` 全图扫描
 * @param visitor 回调集合
 * @returns 整体控制流结果
 */
export function visit<G extends Catalog & Neighbors>(
  graph: G,
  starts: Iterable<NodeId> | null,
  visitor: DfsVisitor,
): Control {
  const color = new Map<NodeId, number>();
  let timer = 0;

  type Frame = { node: NodeId; neighbors: Iterator<NodeId> };
  const stack: Frame[] = [];

  const push = (node: NodeId): Control => {
    color.set(node, GRAY);
    const result = visitor.discover?.({ kind: 'discover', node, time: timer++ }) ?? 'continue';
    if (result === 'break') return 'break';
    if (result === 'prune') {
      // discover 通过、立即 finish。
      color.set(node, BLACK);
      return visitor.finish?.({ kind: 'finish', node, time: timer++ }) ?? 'continue';
    }
    stack.push({ node, neighbors: graph.downstream(node)[Symbol.iterator]() });
    return 'continue';
  };

  const roots = starts ?? graph.nodeIds;
  for (const root of roots) {
    if ((color.get(root) ?? WHITE) !== WHITE) continue;
    if (push(root) === 'break') return 'break';

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const next = frame.neighbors.next();

      if (next.done) {
        color.set(frame.node, BLACK);
        const result =
          visitor.finish?.({ kind: 'finish', node: frame.node, time: timer++ }) ?? 'continue';
        stack.pop();
        if (result === 'break') return 'break';
        continue;
      }

      const target = next.value;
      const targetColor = color.get(target) ?? WHITE;

      if (targetColor === WHITE) {
        const result =
          visitor.treeEdge?.({ kind: 'treeEdge', node: frame.node, target }) ?? 'continue';
        if (result === 'break') return 'break';
        if (result === 'prune') continue;
        if (push(target) === 'break') return 'break';
      } else if (targetColor === GRAY) {
        const result =
          visitor.backEdge?.({ kind: 'backEdge', node: frame.node, target }) ?? 'continue';
        if (result === 'break') return 'break';
      } else {
        const result =
          visitor.crossEdge?.({ kind: 'crossEdge', node: frame.node, target }) ?? 'continue';
        if (result === 'break') return 'break';
      }
    }
  }

  return 'continue';
}
