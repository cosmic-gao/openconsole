import { enumerate } from "../../support";
import type { NodeId, Walkable } from "../../types";

/**
 * 计算有向图的强连通分量（Pearce 2016 迭代算法）。
 * 返回的分量按逆拓扑序排列，每个分量内为成员节点。
 */
export function scc<G extends Walkable>(graph: G): NodeId[][] {
  const { labels: nodes, index } = enumerate(graph);
  const n = nodes.length;

  const rindex = new Int32Array(n);
  const stack: number[] = [];
  const components: NodeId[][] = [];

  let preorder = 1;
  let component = 0;

  type Frame = {
    readonly node: number;
    readonly mark: number;
    readonly iterator: Iterator<NodeId>;
    pending: number;
  };
  const NONE = -1;
  const frames: Frame[] = [];

  const enter = (node: number): void => {
    const mark = preorder++;
    rindex[node] = mark;
    stack.push(node);
    frames.push({
      node,
      mark,
      iterator: graph.outNeighbors(nodes[node]!)[Symbol.iterator](),
      pending: NONE,
    });
  };

  for (let root = 0; root < n; root++) {
    if (rindex[root] !== 0) continue;
    enter(root);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;

      if (frame.pending !== NONE) {
        const child = frame.pending;
        frame.pending = NONE;
        const childLow = rindex[child]!;
        if (childLow > 0 && childLow < rindex[frame.node]!) {
          rindex[frame.node] = childLow;
        }
      }

      const step = frame.iterator.next();
      if (!step.done) {
        const target = index.get(step.value);
        if (target === undefined) continue;
        const targetRank = rindex[target]!;
        if (targetRank === 0) {
          frame.pending = target;
          enter(target);
        } else if (targetRank > 0 && targetRank < rindex[frame.node]!) {
          rindex[frame.node] = targetRank;
        }
        continue;
      }

      if (rindex[frame.node] === frame.mark) {
        const member: NodeId[] = [];
        let w: number;
        do {
          w = stack.pop()!;
          rindex[w] = -(component + 1);
          member.push(nodes[w]!);
        } while (w !== frame.node);
        member.reverse();
        components.push(member);
        component++;
      }

      frames.pop();
    }
  }

  return components;
}
