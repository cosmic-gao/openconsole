import { enumerate } from "../../support";
import type { Catalog, Neighbors, NodeId } from "../../types";
import { scc } from "../connectivity/scc";

/**
 * 可达性位图：按强连通分量存储——同一分量内所有节点的可达集完全相同，故只存一行。
 * 每行 `words` 个 32 位字，第 j 位表示可达下标 j 的节点。
 */
interface Closure {
  readonly labels: NodeId[];
  readonly index: Map<NodeId, number>;
  readonly words: number;
  /** 节点下标 → 所属分量下标。 */
  readonly component: Int32Array;
  /** 行首偏移 = 分量下标 × words。 */
  readonly bits: Uint32Array;
}

/**
 * 一次性求出全图可达性位图，O(V + E·V/32)。
 *
 * @remarks 先缩点（{@link scc} 按逆拓扑序产出分量），再按该顺序做位图或运算——处理某分量时
 *   其后继分量已算完，故一遍扫描即收敛。相比「每个节点跑一次 DFS」省掉一个数量级。
 */
function closure<G extends Catalog & Neighbors>(graph: G): Closure {
  const { labels, index } = enumerate(graph);
  const n = labels.length;
  const words = (n + 31) >>> 5;

  const components = scc(graph);
  const component = new Int32Array(n);
  for (let c = 0; c < components.length; c++) {
    for (const member of components[c]!) {
      const i = index.get(member);
      if (i !== undefined) component[i] = c;
    }
  }

  const bits = new Uint32Array(components.length * words);
  for (let c = 0; c < components.length; c++) {
    const members = components[c]!;
    const row = c * words;
    // 分量内有边（多成员必然互相可达，单成员则看是否自环）→ 成员可达自身。
    let internal = members.length > 1;

    for (const member of members) {
      for (const next of graph.outNeighbors(member)) {
        const j = index.get(next);
        if (j === undefined) continue;
        const target = component[j]!;
        if (target === c) {
          internal = true;
          continue;
        }
        const cell = row + (j >>> 5);
        bits[cell] = bits[cell]! | (1 << (j & 31));
        const source = target * words;
        for (let w = 0; w < words; w++) {
          bits[row + w] = bits[row + w]! | bits[source + w]!;
        }
      }
    }

    if (internal) {
      for (const member of members) {
        const i = index.get(member);
        if (i === undefined) continue;
        const cell = row + (i >>> 5);
        bits[cell] = bits[cell]! | (1 << (i & 31));
      }
    }
  }

  return { labels, index, words, component, bits };
}

function reaches(closed: Closure, from: number, to: number): boolean {
  const row = closed.component[from]! * closed.words;
  return (closed.bits[row + (to >>> 5)]! & (1 << (to & 31))) !== 0;
}

function expand(closed: Closure, node: number): Set<NodeId> {
  const result = new Set<NodeId>();
  const row = closed.component[node]! * closed.words;
  for (let w = 0; w < closed.words; w++) {
    let word = closed.bits[row + w]!;
    while (word !== 0) {
      const bit = 31 - Math.clz32(word & -word);
      result.add(closed.labels[(w << 5) + bit]!);
      word &= word - 1;
    }
  }
  return result;
}

/** 传递闭包；环上节点（含自环）可达自身，无环节点不含自身。 */
export function transitiveClosure<G extends Catalog & Neighbors>(
  graph: G,
): Map<NodeId, Set<NodeId>> {
  const closed = closure(graph);
  const result = new Map<NodeId, Set<NodeId>>();
  for (let i = 0; i < closed.labels.length; i++) {
    result.set(closed.labels[i]!, expand(closed, i));
  }
  return result;
}

/** 传递归约：去掉可由其他路径间接到达的边。只对 DAG 有唯一解。 */
export function transitiveReduction<G extends Catalog & Neighbors>(
  graph: G,
): Array<[NodeId, NodeId]> {
  const closed = closure(graph);
  const kept: Array<[NodeId, NodeId]> = [];
  for (const source of graph.nodes()) {
    const targets = [...new Set(graph.outNeighbors(source))];
    for (const target of targets) {
      const to = closed.index.get(target);
      if (to === undefined) continue;
      let redundant = false;
      for (const other of targets) {
        if (other === target) continue;
        const from = closed.index.get(other);
        if (from !== undefined && reaches(closed, from, to)) {
          redundant = true;
          break;
        }
      }
      if (!redundant) kept.push([source, target]);
    }
  }
  return kept;
}
