import type {
  Catalog,
  EdgeId,
  EdgeView,
  IntoEdges,
  Neighbors,
  NodeId,
} from "../types";

/** 一条桥边：删去后会增加连通分量数的无向边（端点 from、to）。 */
export interface Bridge {
  readonly from: NodeId;
  readonly to: NodeId;
}

/**
 * 按无向视角用 Tarjan 算法（迭代式 DFS）求图的桥与割点。
 * @returns bridges 为所有桥边，articulations 为所有割点。
 */
export function bridges<E, G extends Catalog & Neighbors & IntoEdges<E>>(
  graph: G,
): {
  bridges: Bridge[];
  articulations: NodeId[];
} {
  const nodes: NodeId[] = [];
  const index = new Map<NodeId, number>();
  for (const id of graph.nodes()) {
    if (!index.has(id)) {
      index.set(id, nodes.length);
      nodes.push(id);
    }
  }
  const n = nodes.length;

  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const cut = new Uint8Array(n);
  const bridgeList: Bridge[] = [];
  let timer = 0;

  type Frame = {
    readonly node: number;
    readonly viaEdge: EdgeId | null;
    readonly iterator: Iterator<EdgeView<E>>;
    children: number;
    pending: number;
  };
  const NONE = -1;
  const frames: Frame[] = [];

  const incident = function* (v: NodeId): Iterable<EdgeView<E>> {
    yield* graph.outEdges(v);
    for (const e of graph.inEdges(v)) {
      if (e.source === v) continue;
      yield e;
    }
  };

  const otherEnd = (e: EdgeView<E>, here: NodeId): NodeId =>
    e.source === here ? e.target : e.source;

  const enter = (v: number, viaEdge: EdgeId | null): void => {
    disc[v] = low[v] = timer++;
    frames.push({
      node: v,
      viaEdge,
      iterator: incident(nodes[v]!)[Symbol.iterator](),
      children: 0,
      pending: NONE,
    });
  };

  for (let root = 0; root < n; root++) {
    if (disc[root] !== -1) continue;
    enter(root, null);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;

      if (frame.pending !== NONE) {
        const child = frame.pending;
        frame.pending = NONE;

        if (low[child]! < low[frame.node]!) low[frame.node] = low[child]!;

        if (low[child]! > disc[frame.node]!) {
          bridgeList.push({ from: nodes[frame.node]!, to: nodes[child]! });
        }

        if (frame.viaEdge !== null && low[child]! >= disc[frame.node]!) {
          cut[frame.node] = 1;
        }
      }

      const step = frame.iterator.next();
      if (!step.done) {
        const edge = step.value;
        if (frame.viaEdge !== null && edge.id === frame.viaEdge) continue;
        const w = index.get(otherEnd(edge, nodes[frame.node]!));
        if (w === undefined || w === frame.node) continue;
        if (disc[w] === -1) {
          frame.children++;
          frame.pending = w;
          enter(w, edge.id);
        } else if (disc[w]! < low[frame.node]!) {
          low[frame.node] = disc[w]!;
        }
        continue;
      }

      if (frame.viaEdge === null && frame.children >= 2) cut[frame.node] = 1;
      frames.pop();
    }
  }

  const articulations: NodeId[] = [];
  for (let i = 0; i < n; i++) if (cut[i] === 1) articulations.push(nodes[i]!);

  return { bridges: bridgeList, articulations };
}
