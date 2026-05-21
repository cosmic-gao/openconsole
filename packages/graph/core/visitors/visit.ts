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
export interface Visitor {
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

/**
 * 节点颜色（经典三色 DFS）：
 *   WHITE → GRAY → BLACK，状态单向推进，不会倒退。
 *   - WHITE：未访问
 *   - GRAY ：在 DFS 栈上（discover 了但还没 finish）
 *   - BLACK：已 finish，DFS 子树完全访问完毕
 *
 * 边事件按 target 颜色派发：
 *   target=WHITE → treeEdge（DFS 树边）
 *   target=GRAY  → backEdge（指向祖先，是**环**的指示）
 *   target=BLACK → crossEdge（指向已完成子树）
 */
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
  visitor: Visitor,
): Control {
  // color：每个节点的当前颜色；缺省视为 WHITE
  // timer：discover/finish 的时间戳计数器（递增，可被 DfsEvent.time 读取）
  const color = new Map<NodeId, number>();
  let timer = 0;

  // 栈帧：当前节点 + 它的邻居迭代器（边访问边推进）
  type Frame = { node: NodeId; neighbors: Iterator<NodeId> };
  const stack: Frame[] = [];

  // push：节点从 WHITE 进入 GRAY，发 discover 事件，按 Control 决定下一步
  const push = (node: NodeId): Control => {
    color.set(node, GRAY);
    const result = visitor.discover?.({ kind: 'discover', node, time: timer++ }) ?? 'continue';
    if (result === 'break') return 'break';
    if (result === 'prune') {
      // prune：跳过下钻，但仍然要走 finish 事件（节点的"生命周期"完整）
      color.set(node, BLACK);
      return visitor.finish?.({ kind: 'finish', node, time: timer++ }) ?? 'continue';
    }
    stack.push({ node, neighbors: graph.downstream(node)[Symbol.iterator]() });
    return 'continue';
  };

  // starts=null → 全图扫描（按 nodeIds 顺序，跨多个连通分量）
  const roots = starts ?? graph.nodeIds;
  for (const root of roots) {
    if ((color.get(root) ?? WHITE) !== WHITE) continue;
    if (push(root) === 'break') return 'break';

    // ─── 主循环：迭代 DFS ─────────────────────────────────
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const next = frame.neighbors.next();

      // 当前节点的邻居都访问完 → finish 事件、变 BLACK、出栈
      if (next.done) {
        color.set(frame.node, BLACK);
        const result =
          visitor.finish?.({ kind: 'finish', node: frame.node, time: timer++ }) ?? 'continue';
        stack.pop();
        if (result === 'break') return 'break';
        continue;
      }

      // ─── 边事件按 target 颜色派发 ──────────────────────
      const target = next.value;
      const targetColor = color.get(target) ?? WHITE;

      if (targetColor === WHITE) {
        // WHITE 邻居 = tree edge，下钻
        const result =
          visitor.treeEdge?.({ kind: 'treeEdge', node: frame.node, target }) ?? 'continue';
        if (result === 'break') return 'break';
        if (result === 'prune') continue;   // 不下钻，但当前节点 DFS 继续看下一条边
        if (push(target) === 'break') return 'break';
      } else if (targetColor === GRAY) {
        // GRAY 邻居 = back edge，指向 DFS 栈中节点 → 环的指示
        const result =
          visitor.backEdge?.({ kind: 'backEdge', node: frame.node, target }) ?? 'continue';
        if (result === 'break') return 'break';
      } else {
        // BLACK 邻居 = cross / forward edge，指向已完成子树
        const result =
          visitor.crossEdge?.({ kind: 'crossEdge', node: frame.node, target }) ?? 'continue';
        if (result === 'break') return 'break';
      }
    }
  }

  return 'continue';
}
