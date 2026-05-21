/**
 * csr：把图编译为 CSR (Compressed Sparse Row) 视图，让算法在 typed-array 上跑。
 *
 * @remarks
 * 适用场景：图结构不再变化、需要多次跑算法（拓扑、最短路、SCC 等）。
 * CSR 把 V 个节点的邻接表压成两个连续数组：
 * - `offsets: Int32Array(V+1)`：节点 i 的邻居在 `targets` 中的区间是 `[offsets[i], offsets[i+1])`
 * - `targets: Int32Array(E)`：每个邻居的稠密节点索引
 *
 * 对随机访问 + 顺序遍历的图算法，CSR 在 cache-friendly 与 SIMD-friendly 两个维度上都
 * 显著优于 Map / 链表实现，通常加速 5-20×。
 */

import type {
  Catalog,
  Direction,
  IntoDegree,
  Neighbors,
  NodeId,
  NodeIndexable,
  Walkable,
} from '../types';

/**
 * 编译后的 CSR 视图。实现 {@link Walkable} + {@link IntoDegree} + {@link NodeIndexable}，
 * 可直接喂给 toposort / scc / dfs / bfs / dominator / bridges 等算法。
 *
 * 不实现 {@link IntoEdges} — CSR 不保留 EdgeId / 边权重；如果算法需要权重，
 * 调用方在 {@link Csr.weights} 上自行索引（按 `getOutgoing` 顺序）。
 */
export class Csr implements Walkable, IntoDegree, NodeIndexable {
  /** 出邻区段起点：`outOffsets[i]..outOffsets[i+1]` 是节点 i 的出邻在 {@link outTargets} 中的下标。 */
  public readonly outOffsets: Int32Array;
  /** 出邻的稠密节点索引数组（长度 = E）。 */
  public readonly outTargets: Int32Array;
  /** 入邻区段起点（对称结构，便于跑 {@link upstream}）。 */
  public readonly inOffsets: Int32Array;
  /** 入邻的稠密节点索引数组。 */
  public readonly inTargets: Int32Array;
  /** 节点稠密 idx → 原始 NodeId。 */
  public readonly nodes: ReadonlyArray<NodeId>;
  /** 原始 NodeId → 稠密 idx；用于 {@link indexOf}。 */
  public readonly index: ReadonlyMap<NodeId, number>;
  /**
   * 可选：边权重数组，与 {@link outTargets} 一一对应。
   * 调用方在 {@link compile} 时通过 `weight` 回调注入。
   */
  public readonly weights: Float64Array | undefined;

  /** @internal 用 {@link compile} 工厂构造。 */
  private constructor(init: {
    outOffsets: Int32Array;
    outTargets: Int32Array;
    inOffsets: Int32Array;
    inTargets: Int32Array;
    nodes: NodeId[];
    index: Map<NodeId, number>;
    weights?: Float64Array;
  }) {
    this.outOffsets = init.outOffsets;
    this.outTargets = init.outTargets;
    this.inOffsets = init.inOffsets;
    this.inTargets = init.inTargets;
    this.nodes = init.nodes;
    this.index = init.index;
    this.weights = init.weights;
  }

  /** {@inheritDoc Catalog.nodeIds} */
  public get nodeIds(): Iterable<NodeId> {
    return this.nodes;
  }

  /**
   * {@inheritDoc Catalog.edgeIds}
   *
   * @remarks CSR 不保留 EdgeId；返回空可迭代。需要 EdgeId 的算法应在原图上跑。
   */
  public readonly edgeIds: Iterable<never> = {
    *[Symbol.iterator]() {},
  };

  /** {@inheritDoc Catalog.nodeCount} */
  public nodeCount(): number {
    return this.nodes.length;
  }

  /** {@inheritDoc Catalog.edgeCount} */
  public edgeCount(): number {
    return this.outTargets.length;
  }

  /** {@inheritDoc Neighbors.neighbors} */
  public *neighbors(nodeId: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction === 'input') {
      yield* this.upstream(nodeId);
      return;
    }
    if (direction === 'output') {
      yield* this.downstream(nodeId);
      return;
    }
    yield* this.upstream(nodeId);
    yield* this.downstream(nodeId);
  }

  /** {@inheritDoc Neighbors.upstream} */
  public *upstream(nodeId: NodeId): Iterable<NodeId> {
    const i = this.index.get(nodeId);
    if (i === undefined) return;
    const lo = this.inOffsets[i]!;
    const hi = this.inOffsets[i + 1]!;
    for (let k = lo; k < hi; k++) yield this.nodes[this.inTargets[k]!]!;
  }

  /** {@inheritDoc Neighbors.downstream} */
  public *downstream(nodeId: NodeId): Iterable<NodeId> {
    const i = this.index.get(nodeId);
    if (i === undefined) return;
    const lo = this.outOffsets[i]!;
    const hi = this.outOffsets[i + 1]!;
    for (let k = lo; k < hi; k++) yield this.nodes[this.outTargets[k]!]!;
  }

  /** {@inheritDoc IntoDegree.inDegree} */
  public inDegree(nodeId: NodeId): number {
    const i = this.index.get(nodeId);
    if (i === undefined) return 0;
    return this.inOffsets[i + 1]! - this.inOffsets[i]!;
  }

  /** {@inheritDoc IntoDegree.outDegree} */
  public outDegree(nodeId: NodeId): number {
    const i = this.index.get(nodeId);
    if (i === undefined) return 0;
    return this.outOffsets[i + 1]! - this.outOffsets[i]!;
  }

  /** {@inheritDoc NodeIndexable.bound} */
  public bound(): number {
    return this.nodes.length;
  }

  /** {@inheritDoc NodeIndexable.at} */
  public at(idx: number): NodeId | undefined {
    return this.nodes[idx];
  }

  /** {@inheritDoc NodeIndexable.indexOf} */
  public indexOf(nodeId: NodeId): number {
    return this.index.get(nodeId) ?? -1;
  }

  /**
   * 一次性编译：把任意 `Catalog & Neighbors` 图压成 CSR。
   *
   * @param graph 源图
   * @param weight 可选：从一条 `(from, to)` 边读权重；提供时输出 {@link Csr.weights}
   *   与 {@link outTargets} 一一对应。
   */
  public static compile<G extends Catalog & Neighbors>(
    graph: G,
    weight?: (from: NodeId, to: NodeId) => number,
  ): Csr {
    const nodes: NodeId[] = [];
    const index = new Map<NodeId, number>();
    for (const id of graph.nodeIds) {
      if (!index.has(id)) {
        index.set(id, nodes.length);
        nodes.push(id);
      }
    }
    const n = nodes.length;

    // 两遍扫描：第一遍数出度入度，第二遍填 targets。
    const outOffsets = new Int32Array(n + 1);
    const inOffsets = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) {
      const id = nodes[i]!;
      let out = 0;
      for (const t of graph.downstream(id)) {
        if (index.has(t)) out++;
      }
      outOffsets[i + 1] = out;
      let inc = 0;
      for (const s of graph.upstream(id)) {
        if (index.has(s)) inc++;
      }
      inOffsets[i + 1] = inc;
    }
    // 前缀和
    for (let i = 1; i <= n; i++) {
      outOffsets[i] = outOffsets[i]! + outOffsets[i - 1]!;
      inOffsets[i] = inOffsets[i]! + inOffsets[i - 1]!;
    }

    const e = outOffsets[n]!;
    const outTargets = new Int32Array(e);
    const inTargets = new Int32Array(inOffsets[n]!);
    const weights = weight ? new Float64Array(e) : undefined;

    const outCursor = new Int32Array(n);
    const inCursor = new Int32Array(n);

    for (let i = 0; i < n; i++) {
      const id = nodes[i]!;
      for (const t of graph.downstream(id)) {
        const j = index.get(t);
        if (j === undefined) continue;
        const k = outOffsets[i]! + outCursor[i]!;
        outTargets[k] = j;
        if (weights) weights[k] = weight!(id, t);
        outCursor[i] = outCursor[i]! + 1;
      }
      for (const s of graph.upstream(id)) {
        const j = index.get(s);
        if (j === undefined) continue;
        const k = inOffsets[i]! + inCursor[i]!;
        inTargets[k] = j;
        inCursor[i] = inCursor[i]! + 1;
      }
    }

    // exactOptionalPropertyTypes: 显式 undefined 与缺省键不等价，分两路构造。
    return weights
      ? new Csr({ outOffsets, outTargets, inOffsets, inTargets, nodes, index, weights })
      : new Csr({ outOffsets, outTargets, inOffsets, inTargets, nodes, index });
  }
}

/** 函数式工厂：等价 `Csr.compile(graph)`。 */
export function csr<G extends Catalog & Neighbors>(
  graph: G,
  weight?: (from: NodeId, to: NodeId) => number,
): Csr {
  return Csr.compile(graph, weight);
}
