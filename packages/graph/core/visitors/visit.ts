import type { Catalog, Control, DfsEvent, Neighbors, NodeId } from "../types";

/**
 * DFS 事件回调接口。各回调可返回 {@link Control} 控制遍历：
 * 继续、剪枝该子树或整体中止。所有回调均为可选。
 */
export interface Visitor {
  /** 首次发现节点（置灰）时触发。 */
  discover?(event: DfsEvent): Control | void;
  /** 节点的所有后代访问完毕（置黑）时触发。 */
  finish?(event: DfsEvent): Control | void;
  /** 遇到通往未访问节点的树边时触发。 */
  treeEdge?(event: DfsEvent): Control | void;
  /** 遇到指向祖先（灰节点）的回边时触发，意味着存在环。 */
  backEdge?(event: DfsEvent): Control | void;
  /** 遇到指向已完成（黑节点）的横向/前向边时触发。 */
  crossEdge?(event: DfsEvent): Control | void;
}

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

/**
 * 事件回调式的三色（白/灰/黑）深度优先遍历。
 * 从 `starts`（为 `null` 时遍历全部节点）出发，按事件调用 `visitor` 的回调，
 * 并依据回调返回的 {@link Control} 决定继续、剪枝或中止。
 */
export function visit<G extends Catalog & Neighbors>(
  graph: G,
  starts: Iterable<NodeId> | null,
  visitor: Visitor,
): Control {
  const color = new Map<NodeId, number>();
  let timer = 0;

  type Frame = { node: NodeId; neighbors: Iterator<NodeId> };
  const stack: Frame[] = [];

  const push = (node: NodeId): Control => {
    color.set(node, GRAY);
    const result =
      visitor.discover?.({ kind: "discover", node, time: timer++ }) ??
      "continue";
    if (result === "break") return "break";
    if (result === "prune") {
      color.set(node, BLACK);
      return (
        visitor.finish?.({ kind: "finish", node, time: timer++ }) ?? "continue"
      );
    }
    stack.push({
      node,
      neighbors: graph.outNeighbors(node)[Symbol.iterator](),
    });
    return "continue";
  };

  const roots = starts ?? graph.nodes();
  for (const root of roots) {
    if ((color.get(root) ?? WHITE) !== WHITE) continue;
    if (push(root) === "break") return "break";

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const next = frame.neighbors.next();

      if (next.done) {
        color.set(frame.node, BLACK);
        const result =
          visitor.finish?.({
            kind: "finish",
            node: frame.node,
            time: timer++,
          }) ?? "continue";
        stack.pop();
        if (result === "break") return "break";
        continue;
      }

      const target = next.value;
      const targetColor = color.get(target) ?? WHITE;

      if (targetColor === WHITE) {
        const result =
          visitor.treeEdge?.({ kind: "treeEdge", node: frame.node, target }) ??
          "continue";
        if (result === "break") return "break";
        if (result === "prune") continue;
        if (push(target) === "break") return "break";
      } else if (targetColor === GRAY) {
        const result =
          visitor.backEdge?.({ kind: "backEdge", node: frame.node, target }) ??
          "continue";
        if (result === "break") return "break";
      } else {
        const result =
          visitor.crossEdge?.({
            kind: "crossEdge",
            node: frame.node,
            target,
          }) ?? "continue";
        if (result === "break") return "break";
      }
    }
  }

  return "continue";
}
