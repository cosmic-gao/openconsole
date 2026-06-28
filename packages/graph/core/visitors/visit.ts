import type { Catalog, Control, DfsEvent, Neighbors, NodeId } from '../types';

export interface Visitor {
  discover?(event: DfsEvent): Control | void;
  finish?(event: DfsEvent): Control | void;
  treeEdge?(event: DfsEvent): Control | void;
  backEdge?(event: DfsEvent): Control | void;
  crossEdge?(event: DfsEvent): Control | void;
}

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

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
    const result = visitor.discover?.({ kind: 'discover', node, time: timer++ }) ?? 'continue';
    if (result === 'break') return 'break';
    if (result === 'prune') {
      color.set(node, BLACK);
      return visitor.finish?.({ kind: 'finish', node, time: timer++ }) ?? 'continue';
    }
    stack.push({ node, neighbors: graph.outNeighbors(node)[Symbol.iterator]() });
    return 'continue';
  };

  const roots = starts ?? graph.nodes();
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
