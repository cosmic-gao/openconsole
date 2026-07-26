import {
  Graph,
  graphId,
  nodeId,
  Snapshot,
  Socket,
  Vertex,
  type EdgeId,
  type NodeId,
  type Sockets,
} from "../index";

/** 确定性伪随机：同一 seed 永远给出同一张图，失败用例可直接复现。 */
export class Rng {
  public constructor(private _state: number) {
    this._state = _state | 0 || 1;
  }

  public next(): number {
    this._state = (this._state * 1103515245 + 12345) & 0x7fffffff;
    return this._state;
  }

  public int(bound: number): number {
    return bound <= 0 ? 0 : this.next() % bound;
  }

  public chance(percent: number): boolean {
    return this.int(100) < percent;
  }
}

export interface Shape {
  order?: number;
  /** 每个节点的平均出边数。 */
  density?: number;
  /** 只连 i → j (j > i)，保证无环。 */
  acyclic?: boolean;
  weights?: "none" | "integer" | "real";
  /** 允许自环。 */
  loops?: boolean;
}

/** 带一对通配端口的节点，测试里绝大多数场景只需要这个形状。 */
export const vertex = <W>(
  name: string,
  weight?: W,
): Vertex<Sockets, Sockets, W> =>
  new Vertex<Sockets, Sockets, W>(nodeId(name), weight)
    .addInput("in", Socket.any)
    .addOutput("out", Socket.any);

export function randomGraph(
  seed: number,
  shape: Shape = {},
): Graph<number, number> {
  const {
    order = 20,
    density = 2,
    acyclic = false,
    weights = "integer",
    loops = false,
  } = shape;
  const rng = new Rng(seed);
  const graph = new Graph<number, number>(graphId(`seed-${seed}`));

  for (let i = 0; i < order; i++) graph.addNode(vertex(`n${i}`, i));

  const cost = (): number | undefined => {
    if (weights === "none") return undefined;
    return weights === "integer" ? rng.int(9) + 1 : (rng.int(900) + 100) / 100;
  };

  for (let i = 0; i < order; i++) {
    for (let k = 0; k < density; k++) {
      const j = acyclic
        ? i + 1 + rng.int(Math.max(1, order - i - 1))
        : rng.int(order);
      if (j >= order) continue;
      if (i === j && !loops) continue;
      graph.connect([nodeId(`n${i}`), "out"], [nodeId(`n${j}`), "in"], {
        weight: cost(),
      });
    }
  }
  return graph;
}

/** 忽略方向的邻接表。 */
function undirectedLinks(graph: Graph<number, number>): Map<NodeId, NodeId[]> {
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
  const seen = new Set<NodeId>();
  const stack = [...roots];
  for (const root of stack) seen.add(root);
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

/** 逐点 BFS 求可达集，不含自身（除非有环回来）。 */
export function naiveReach(
  graph: Graph<number, number>,
): Map<NodeId, Set<NodeId>> {
  const reach = new Map<NodeId, Set<NodeId>>();
  for (const node of graph.nodes()) {
    const found = new Set<NodeId>();
    const stack = [...graph.outNeighbors(node)];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (found.has(next)) continue;
      found.add(next);
      stack.push(...graph.outNeighbors(next));
    }
    reach.set(node, found);
  }
  return reach;
}

/** 强连通分量：互相可达即同组。 */
export function naiveScc(graph: Graph<number, number>): Set<string>[] {
  const reach = naiveReach(graph);
  const grouped: Set<string>[] = [];
  const placed = new Set<NodeId>();
  for (const node of graph.nodes()) {
    if (placed.has(node)) continue;
    const group = new Set<string>([node]);
    placed.add(node);
    for (const other of graph.nodes()) {
      if (other === node || placed.has(other)) continue;
      if (reach.get(node)!.has(other) && reach.get(other)!.has(node)) {
        group.add(other);
        placed.add(other);
      }
    }
    grouped.push(group);
  }
  return grouped;
}

/** 弱连通分量。 */
export function naiveComponents(graph: Graph<number, number>): Set<string>[] {
  const links = undirectedLinks(graph);
  const seen = new Set<NodeId>();
  const grouped: Set<string>[] = [];
  for (const node of graph.nodes()) {
    if (seen.has(node)) continue;
    const group = sweep([node], (n) => links.get(n) ?? []);
    for (const member of group) seen.add(member);
    grouped.push(new Set([...group]));
  }
  return grouped;
}

/** Bellman-Ford，作为 Dijkstra 的独立参照。 */
export function naiveDistances(
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

/** Cooper-Harvey-Kennedy 迭代数据流，与 Lengauer-Tarjan 各自独立。 */
export function naiveDominators(
  graph: Graph<number, number>,
  entry: NodeId,
): Map<NodeId, NodeId> {
  const order: NodeId[] = [];
  const seen = new Set<NodeId>([entry]);
  const visit = (node: NodeId): void => {
    for (const next of graph.outNeighbors(node)) {
      if (seen.has(next)) continue;
      seen.add(next);
      visit(next);
    }
    order.push(node);
  };
  visit(entry);
  const reversed = [...order].reverse();
  const rank = new Map(reversed.map((node, i) => [node, i]));

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
    for (const node of reversed) {
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

const countComponents = (
  nodes: Iterable<NodeId>,
  links: Map<NodeId, NodeId[]>,
  skip: (node: NodeId) => boolean,
): number => {
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
};

/** 桥的定义式判定：逐边删除，看无向连通分量是否变多。 */
export function naiveBridges(graph: Graph<number, number>): Set<string> {
  const links = undirectedLinks(graph);
  const nodes = graph.nodes();
  const base = countComponents(nodes, links, () => false);
  const found = new Set<string>();

  for (const edge of graph.edges()) {
    const record = graph.edge(edge)!;
    if (record.source === record.target) continue;
    const without = new Map<NodeId, NodeId[]>();
    for (const [node, neighbors] of links) without.set(node, [...neighbors]);
    drop(without, record.source, record.target);
    drop(without, record.target, record.source);
    if (countComponents(nodes, without, () => false) > base) {
      found.add(key(record.source, record.target));
    }
  }
  return found;
}

/** 割点的定义式判定：逐点删除，看无向连通分量是否变多。 */
export function naiveArticulations(graph: Graph<number, number>): Set<string> {
  const links = undirectedLinks(graph);
  const nodes = graph.nodes();
  const found = new Set<string>();
  for (const node of nodes) {
    const base = countComponents(nodes, links, (n) => n === node);
    const whole = countComponents(nodes, links, () => false);
    if (base > whole) found.add(node);
  }
  return found;
}

function drop(links: Map<NodeId, NodeId[]>, from: NodeId, to: NodeId): void {
  const list = links.get(from);
  if (!list) return;
  const at = list.indexOf(to);
  if (at >= 0) list.splice(at, 1);
}

/** 无向边的规范化 key，便于比较。 */
export const key = (a: NodeId, b: NodeId): string =>
  a < b ? `${a}|${b}` : `${b}|${a}`;

export const edgeKey = (graph: Graph<number, number>, edge: EdgeId): string => {
  const record = graph.edge(edge)!;
  return key(record.source, record.target);
};

/** 索引空间的分组换回 id 再规范化，便于与朴素实现对拍。 */
export const groupKeys = (
  snapshot: Snapshot,
  groups: Array<Iterable<number>>,
): string[] =>
  groups.map((group) => snapshot.names(group).sort().join(",")).sort();

export const setKeys = (groups: Set<string>[]): string[] =>
  groups.map((group) => [...group].sort().join(",")).sort();
