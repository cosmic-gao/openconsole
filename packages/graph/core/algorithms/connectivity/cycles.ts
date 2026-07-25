import { enumerate } from "../../support";
import type { Catalog, Neighbors, NodeId } from "../../types";

interface Frame {
  readonly node: NodeId;
  readonly iterator: Iterator<NodeId>;
  found: boolean;
}

/**
 * 用 Johnson 算法枚举有向图中所有简单环，每个环以节点序列返回。
 * 显式栈实现（非递归），环长与阻塞链长不受调用栈深度限制。
 */
export function simpleCycles<G extends Catalog & Neighbors>(
  graph: G,
): NodeId[][] {
  const { labels: nodes, index } = enumerate(graph);

  const result: NodeId[][] = [];
  const blocked = new Set<NodeId>();
  const noEntry = new Map<NodeId, Set<NodeId>>();
  const path: NodeId[] = [];
  const frames: Frame[] = [];

  /** 解除阻塞并沿 noEntry 反向链传播（显式栈替代递归）。 */
  const unblock = (root: NodeId): void => {
    const pending: NodeId[] = [root];
    while (pending.length > 0) {
      const node = pending.pop()!;
      blocked.delete(node);
      const set = noEntry.get(node);
      if (!set) continue;
      for (const blockedOn of [...set]) {
        set.delete(blockedOn);
        if (blocked.has(blockedOn)) pending.push(blockedOn);
      }
    }
  };

  const enter = (node: NodeId): void => {
    path.push(node);
    blocked.add(node);
    frames.push({
      node,
      iterator: graph.outNeighbors(node)[Symbol.iterator](),
      found: false,
    });
  };

  for (let start = 0; start < nodes.length; start++) {
    const root = nodes[start]!;
    blocked.clear();
    noEntry.clear();
    enter(root);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const step = frame.iterator.next();

      if (!step.done) {
        const next = step.value;
        const order = index.get(next);
        if (order === undefined || order < start) continue;
        if (next === root) {
          result.push([...path]);
          frame.found = true;
        } else if (!blocked.has(next)) {
          enter(next);
        }
        continue;
      }

      if (frame.found) {
        unblock(frame.node);
      } else {
        for (const next of graph.outNeighbors(frame.node)) {
          const order = index.get(next);
          if (order === undefined || order < start) continue;
          let set = noEntry.get(next);
          if (!set) {
            set = new Set();
            noEntry.set(next, set);
          }
          set.add(frame.node);
        }
      }

      frames.pop();
      path.pop();
      const parent = frames[frames.length - 1];
      if (parent && frame.found) parent.found = true;
    }
  }

  return result;
}
