import type { Graph } from "../graph";
import type { NodeId } from "../ident";
import type { Snapshot } from "../snapshot";

export interface Degree {
  readonly inDegree: number;
  readonly outDegree: number;
}

export function degrees(snapshot: Snapshot): Map<NodeId, Degree> {
  const found = new Map<NodeId, Degree>();
  for (let u = 0; u < snapshot.order; u++) {
    found.set(snapshot.label(u), {
      inDegree: snapshot.inDegree(u),
      outDegree: snapshot.outDegree(u),
    });
  }
  return found;
}

/** 入度为 0 的节点。 */
export const sources = (snapshot: Snapshot): NodeId[] =>
  select(snapshot, (u) => snapshot.inDegree(u) === 0);

/** 出度为 0 的节点。 */
export const sinks = (snapshot: Snapshot): NodeId[] =>
  select(snapshot, (u) => snapshot.outDegree(u) === 0);

/** 入度与出度都为 0 的节点。 */
export const isolated = (snapshot: Snapshot): NodeId[] =>
  select(
    snapshot,
    (u) => snapshot.inDegree(u) === 0 && snapshot.outDegree(u) === 0,
  );

function select(snapshot: Snapshot, keep: (u: number) => boolean): NodeId[] {
  const found: NodeId[] = [];
  for (let u = 0; u < snapshot.order; u++) {
    if (keep(u)) found.push(snapshot.label(u));
  }
  return found;
}

export interface Around {
  readonly predecessors: NodeId[];
  readonly successors: NodeId[];
}

/** 一次性快照全图每个节点的前驱与后继。 */
export function neighborhood(snapshot: Snapshot): Map<NodeId, Around> {
  const { offset, other } = snapshot.outbound;
  const inbound = snapshot.inbound;
  const found = new Map<NodeId, Around>();
  for (let u = 0; u < snapshot.order; u++) {
    const successors: NodeId[] = [];
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      successors.push(snapshot.label(other[k]!));
    }
    const predecessors: NodeId[] = [];
    if (inbound) {
      for (let k = inbound.offset[u]!; k < inbound.offset[u + 1]!; k++) {
        predecessors.push(snapshot.label(inbound.other[k]!));
      }
    }
    found.set(snapshot.label(u), { predecessors, successors });
  }
  return found;
}

/** 复合层级的顶层节点。层级只存在于可变图上，故这三个查询接受 {@link Graph}。 */
export function roots(graph: Graph): NodeId[] {
  return graph.nodes().filter((node) => graph.parent(node) === undefined);
}

/** 以 `root` 为根的子树全部节点，含自身。 */
export function subtree(graph: Graph, root: NodeId): NodeId[] {
  const found: NodeId[] = [];
  const stack: NodeId[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    found.push(node);
    stack.push(...graph.children(node));
  }
  return found;
}

/** 自底向上的祖先链，不含自身。 */
export function ancestry(graph: Graph, node: NodeId): NodeId[] {
  const chain: NodeId[] = [];
  for (
    let cursor = graph.parent(node);
    cursor !== undefined;
    cursor = graph.parent(cursor)
  ) {
    chain.push(cursor);
  }
  return chain;
}
