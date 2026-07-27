import type { Graph, NodeId } from "../index";

/**
 * 各算法的独立参照实现，只用 {@link Graph} 的公开查询，一律照定义直写。
 *
 * 它们存在的意义是与 `core/algorithm` **各自独立**：那边是 Pearce / Tarjan /
 * Lengauer-Tarjan 这类带巧思的迭代版本，这边是能一眼看懂的笨办法。两边在随机图上
 * 逐一对拍，任何一侧的巧思出错都会立刻暴露。因此这里**刻意不做任何优化**。
 */

/** 忽略方向的邻接表。 */
function undirected(graph: Graph<number, number>): Map<NodeId, NodeId[]> {
  const links = new Map<NodeId, NodeId[]>();
  for (const node of graph.nodes()) links.set(node, []);
  for (const edge of graph.edges()) {
    const record = graph.edge(edge)!;
    links.get(record.source)!.push(record.target);
    links.get(record.target)!.push(record.source);
  }
  return links;
}

function sweep(
  roots: Iterable<NodeId>,
  step: (node: NodeId) => Iterable<NodeId>,
): Set<NodeId> {
  const seen = new Set<NodeId>(roots);
  const stack = [...seen];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (const next of step(node)) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

/** 逐点搜索求可达集，不含自身（除非有环绕回来）。 */
export function reach(
  graph: Graph<number, number>,
): Map<NodeId, Set<NodeId>> {
  const found = new Map<NodeId, Set<NodeId>>();
  for (const node of graph.nodes()) {
    found.set(
      node,
      sweep(graph.outNeighbors(node), (n) => graph.outNeighbors(n)),
    );
  }
  return found;
}

/** 强连通分量：互相可达即同组。 */
export function scc(graph: Graph<number, number>): Set<string>[] {
  const reachable = reach(graph);
  const grouped: Set<string>[] = [];
  const placed = new Set<NodeId>();
  for (const node of graph.nodes()) {
    if (placed.has(node)) continue;
    const group = new Set<string>([node]);
    placed.add(node);
    for (const other of graph.nodes()) {
      if (other === node || placed.has(other)) continue;
      if (reachable.get(node)!.has(other) && reachable.get(other)!.has(node)) {
        group.add(other);
        placed.add(other);
      }
    }
    grouped.push(group);
  }
  return grouped;
}

/** 弱连通分量。 */
export function components(graph: Graph<number, number>): Set<string>[] {
  const links = undirected(graph);
  const seen = new Set<NodeId>();
  const grouped: Set<string>[] = [];
  for (const node of graph.nodes()) {
    if (seen.has(node)) continue;
    const group = sweep([node], (n) => links.get(n) ?? []);
    for (const member of group) seen.add(member);
    grouped.push(new Set(group));
  }
  return grouped;
}

/** Bellman-Ford，作为 Dijkstra 的参照。 */
export function distances(
  graph: Graph<number, number>,
  source: NodeId,
): Map<NodeId, number> {
  const distance = new Map<NodeId, number>();
  for (const node of graph.nodes()) distance.set(node, Infinity);
  distance.set(source, 0);

  for (let round = 0; round < graph.order; round++) {
    let changed = false;
    for (const edge of graph.edges()) {
      const record = graph.edge(edge)!;
      const base = distance.get(record.source)!;
      if (base === Infinity) continue;
      const candidate = base + (record.weight ?? 1);
      if (candidate < distance.get(record.target)!) {
        distance.set(record.target, candidate);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return distance;
}

/** Cooper-Harvey-Kennedy 迭代数据流，与 Lengauer-Tarjan 互不相干。 */
export function dominators(
  graph: Graph<number, number>,
  entry: NodeId,
): Map<NodeId, NodeId> {
  const postorder: NodeId[] = [];
  const seen = new Set<NodeId>([entry]);
  const walk = (node: NodeId): void => {
    for (const next of graph.outNeighbors(node)) {
      if (seen.has(next)) continue;
      seen.add(next);
      walk(next);
    }
    postorder.push(node);
  };
  walk(entry);

  const order = [...postorder].reverse();
  const rank = new Map(order.map((node, at) => [node, at]));
  const idom = new Map<NodeId, NodeId>([[entry, entry]]);

  const meet = (a: NodeId, b: NodeId): NodeId => {
    let left = a;
    let right = b;
    while (left !== right) {
      while (rank.get(left)! > rank.get(right)!) left = idom.get(left)!;
      while (rank.get(right)! > rank.get(left)!) right = idom.get(right)!;
    }
    return left;
  };

  for (let changed = true; changed; ) {
    changed = false;
    for (const node of order) {
      if (node === entry) continue;
      let candidate: NodeId | undefined;
      for (const predecessor of graph.inNeighbors(node)) {
        if (!idom.has(predecessor)) continue;
        candidate =
          candidate === undefined ? predecessor : meet(predecessor, candidate);
      }
      if (candidate !== undefined && idom.get(node) !== candidate) {
        idom.set(node, candidate);
        changed = true;
      }
    }
  }
  return idom;
}

function countComponents(
  nodes: ReadonlyArray<NodeId>,
  links: Map<NodeId, NodeId[]>,
  skip: (node: NodeId) => boolean,
): number {
  const seen = new Set<NodeId>();
  let count = 0;
  for (const node of nodes) {
    if (skip(node) || seen.has(node)) continue;
    count++;
    for (const member of sweep([node], (n) =>
      (links.get(n) ?? []).filter((other) => !skip(other)),
    )) {
      seen.add(member);
    }
  }
  return count;
}

/** 桥的定义式判定：逐边删除，看无向连通分量是否变多。 */
export function bridges(graph: Graph<number, number>): Set<string> {
  const links = undirected(graph);
  const nodes = graph.nodes();
  const base = countComponents(nodes, links, () => false);
  const found = new Set<string>();

  for (const edge of graph.edges()) {
    const record = graph.edge(edge)!;
    if (record.source === record.target) continue;
    const without = new Map<NodeId, NodeId[]>();
    for (const [node, neighbors] of links) without.set(node, [...neighbors]);
    unlink(without, record.source, record.target);
    unlink(without, record.target, record.source);
    if (countComponents(nodes, without, () => false) > base) {
      found.add(
        record.source < record.target
          ? `${record.source}|${record.target}`
          : `${record.target}|${record.source}`,
      );
    }
  }
  return found;
}

/** 割点的定义式判定：逐点删除，看无向连通分量是否变多。 */
export function articulations(graph: Graph<number, number>): Set<string> {
  const links = undirected(graph);
  const nodes = graph.nodes();
  const whole = countComponents(nodes, links, () => false);
  const found = new Set<string>();
  for (const node of nodes) {
    if (countComponents(nodes, links, (n) => n === node) > whole) {
      found.add(node);
    }
  }
  return found;
}

function unlink(
  links: Map<NodeId, NodeId[]>,
  from: NodeId,
  to: NodeId,
): void {
  const list = links.get(from);
  const at = list?.indexOf(to) ?? -1;
  if (at >= 0) list!.splice(at, 1);
}
