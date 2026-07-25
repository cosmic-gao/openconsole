import type { Catalog, Neighbors, NodeId } from "../../types";

/**
 * 用 Lengauer-Tarjan 算法构建从 entry 出发的支配树。
 * 仅覆盖 entry 可达的节点；entry 的直接支配点记为自身。
 * @returns 每个节点到其直接支配点（idom）的映射。
 */
export function dominator<G extends Catalog & Neighbors>(
  graph: G,
  entry: NodeId,
): Map<NodeId, NodeId> {
  const dfn: NodeId[] = [];
  const num = new Map<NodeId, number>();
  const parent: number[] = [];
  const predecessors: number[][] = [];

  type Frame = { v: NodeId; iterator: Iterator<NodeId> };
  const stack: Frame[] = [
    { v: entry, iterator: graph.outNeighbors(entry)[Symbol.iterator]() },
  ];
  num.set(entry, 0);
  dfn.push(entry);
  parent.push(-1);
  predecessors.push([]);

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    const step = frame.iterator.next();
    if (step.done) {
      stack.pop();
      continue;
    }
    const child = step.value;
    if (!num.has(child)) {
      const childIndex = dfn.length;
      const parentIndex = num.get(frame.v)!;
      num.set(child, childIndex);
      dfn.push(child);
      parent.push(parentIndex);
      predecessors.push([]);
      stack.push({
        v: child,
        iterator: graph.outNeighbors(child)[Symbol.iterator](),
      });
    }
  }

  const n = dfn.length;

  for (let i = 0; i < n; i++) {
    for (const predecessor of graph.inNeighbors(dfn[i]!)) {
      const predecessorIndex = num.get(predecessor);
      if (predecessorIndex !== undefined)
        predecessors[i]!.push(predecessorIndex);
    }
  }

  const semi = new Int32Array(n);
  const ancestor = new Int32Array(n).fill(-1);
  const label = new Int32Array(n);
  const bucket: number[][] = Array.from({ length: n }, () => []);
  const dom = new Int32Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    semi[i] = i;
    label[i] = i;
  }

  const compress = (v: number): void => {
    const path: number[] = [];
    let current = v;
    while (ancestor[ancestor[current]!]! !== -1) {
      path.push(current);
      current = ancestor[current]!;
    }
    for (let i = path.length - 1; i >= 0; i--) {
      const w = path[i]!;
      const a = ancestor[w]!;
      if (semi[label[a]!]! < semi[label[w]!]!) {
        label[w] = label[a]!;
      }
      ancestor[w] = ancestor[a]!;
    }
  };

  const evalNode = (v: number): number => {
    if (ancestor[v] === -1) return v;
    compress(v);
    return label[v]!;
  };

  for (let w = n - 1; w > 0; w--) {
    for (const u of predecessors[w]!) {
      const evaluated = evalNode(u);
      if (semi[evaluated]! < semi[w]!) semi[w] = semi[evaluated]!;
    }
    bucket[semi[w]!]!.push(w);
    ancestor[w] = parent[w]!;

    const p = parent[w]!;
    const queue = bucket[p]!;
    for (const v of queue) {
      const u = evalNode(v);
      dom[v] = semi[u]! < semi[v]! ? u : p;
    }
    queue.length = 0;
  }

  for (let w = 1; w < n; w++) {
    if (dom[w] !== semi[w]) dom[w] = dom[dom[w]!]!;
  }

  const result = new Map<NodeId, NodeId>();
  result.set(entry, entry);
  for (let w = 1; w < n; w++) {
    result.set(dfn[w]!, dfn[dom[w]!]!);
  }
  return result;
}
