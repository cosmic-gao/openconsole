import { enumerate } from "../../support";
import type {
  Catalog,
  Direction,
  EdgeId,
  EdgeView,
  IntoDegree,
  IntoEdges,
  Neighbors,
  NodeId,
  NodeIndexable,
  Walkable,
} from "../../types";

/**
 * CSR（压缩稀疏行）快照：typed-array 紧凑存储邻接，适合在同一快照上多次跑算法。
 * 节点按首次出现顺序编号，可选携带正反向权重。
 *
 * @remarks `edgeViews` / `inEdges` / `outEdges` 产出的 `EdgeView.id` 是合成 id（`e{k}` / `i{k}`），
 *   **不对应原图 `EdgeId`**，也无法区分平行边。
 */
export class Csr
  implements Walkable, IntoDegree, NodeIndexable, IntoEdges<number>
{
  /** 行偏移，长度 `order+1`；节点 i 的出边切片为 `[outOffsets[i], outOffsets[i+1])`。 */
  public readonly outOffsets: Int32Array;
  /** 出边目标的**节点索引**（非 NodeId），按 {@link Csr.outOffsets} 切片访问。 */
  public readonly outTargets: Int32Array;
  public readonly inOffsets: Int32Array;
  public readonly inTargets: Int32Array;
  /** 按索引排列的节点 id（{@link Csr.index} 的逆映射）。 */
  public readonly labels: ReadonlyArray<NodeId>;
  public readonly index: ReadonlyMap<NodeId, number>;
  /** 与 {@link Csr.outTargets} 对齐；未编译权重时为 `undefined`。 */
  public readonly weights: Float64Array | undefined;
  /** 与 {@link Csr.inTargets} 对齐；未编译权重时为 `undefined`。 */
  public readonly inWeights: Float64Array | undefined;

  private constructor(init: {
    outOffsets: Int32Array;
    outTargets: Int32Array;
    inOffsets: Int32Array;
    inTargets: Int32Array;
    labels: NodeId[];
    index: Map<NodeId, number>;
    weights?: Float64Array;
    inWeights?: Float64Array;
  }) {
    this.outOffsets = init.outOffsets;
    this.outTargets = init.outTargets;
    this.inOffsets = init.inOffsets;
    this.inTargets = init.inTargets;
    this.labels = init.labels;
    this.index = init.index;
    this.weights = init.weights;
    this.inWeights = init.inWeights;
  }

  public get order(): number {
    return this.labels.length;
  }

  public get size(): number {
    return this.outTargets.length;
  }

  public nodes(): Iterable<NodeId> {
    return this.labels;
  }

  /** 合成 id `e{k}`，不对应原图 `EdgeId`。 */
  public edges(): Iterable<EdgeId> {
    const count = this.outTargets.length;
    return {
      *[Symbol.iterator]() {
        for (let k = 0; k < count; k++) yield `e${k}` as EdgeId;
      },
    };
  }

  /** 省略 `direction` 时先入邻居后出邻居。 */
  public *neighbors(nodeId: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction === "input") {
      yield* this.inNeighbors(nodeId);
      return;
    }
    if (direction === "output") {
      yield* this.outNeighbors(nodeId);
      return;
    }
    yield* this.inNeighbors(nodeId);
    yield* this.outNeighbors(nodeId);
  }

  public *inNeighbors(nodeId: NodeId): Iterable<NodeId> {
    const i = this.index.get(nodeId);
    if (i === undefined) return;
    const start = this.inOffsets[i]!;
    const end = this.inOffsets[i + 1]!;
    for (let k = start; k < end; k++) yield this.labels[this.inTargets[k]!]!;
  }

  public *outNeighbors(nodeId: NodeId): Iterable<NodeId> {
    const i = this.index.get(nodeId);
    if (i === undefined) return;
    const start = this.outOffsets[i]!;
    const end = this.outOffsets[i + 1]!;
    for (let k = start; k < end; k++) yield this.labels[this.outTargets[k]!]!;
  }

  public *edgeViews(): Iterable<EdgeView<number>> {
    for (let i = 0; i < this.labels.length; i++) {
      const source = this.labels[i]!;
      const start = this.outOffsets[i]!;
      const end = this.outOffsets[i + 1]!;
      for (let k = start; k < end; k++) {
        yield {
          id: `e${k}` as EdgeId,
          source,
          target: this.labels[this.outTargets[k]!]!,
          weight: this.weights ? this.weights[k]! : undefined,
        };
      }
    }
  }

  public *inEdges(nodeId: NodeId): Iterable<EdgeView<number>> {
    const i = this.index.get(nodeId);
    if (i === undefined) return;
    const start = this.inOffsets[i]!;
    const end = this.inOffsets[i + 1]!;
    const target = this.labels[i]!;
    for (let k = start; k < end; k++) {
      yield {
        id: `i${k}` as EdgeId,
        source: this.labels[this.inTargets[k]!]!,
        target,
        weight: this.inWeights ? this.inWeights[k]! : undefined,
      };
    }
  }

  public *outEdges(nodeId: NodeId): Iterable<EdgeView<number>> {
    const i = this.index.get(nodeId);
    if (i === undefined) return;
    const start = this.outOffsets[i]!;
    const end = this.outOffsets[i + 1]!;
    const source = this.labels[i]!;
    for (let k = start; k < end; k++) {
      yield {
        id: `e${k}` as EdgeId,
        source,
        target: this.labels[this.outTargets[k]!]!,
        weight: this.weights ? this.weights[k]! : undefined,
      };
    }
  }

  /** 未知节点返回 0。 */
  public inDegree(nodeId: NodeId): number {
    const i = this.index.get(nodeId);
    if (i === undefined) return 0;
    return this.inOffsets[i + 1]! - this.inOffsets[i]!;
  }

  /** 未知节点返回 0。 */
  public outDegree(nodeId: NodeId): number {
    const i = this.index.get(nodeId);
    if (i === undefined) return 0;
    return this.outOffsets[i + 1]! - this.outOffsets[i]!;
  }

  public bound(): number {
    return this.labels.length;
  }

  public at(index: number): NodeId | undefined {
    return this.labels[index];
  }

  /** 未知节点返回 -1。 */
  public indexOf(nodeId: NodeId): number {
    return this.index.get(nodeId) ?? -1;
  }

  /** @param weight 边权函数，按 `(from, to)` 求值；省略则不携带权重 */
  public static compile<G extends Catalog & Neighbors>(
    graph: G,
    weight?: (from: NodeId, to: NodeId) => number,
  ): Csr {
    const { labels, index } = enumerate(graph);
    const n = labels.length;

    const outOffsets = new Int32Array(n + 1);
    const inOffsets = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) {
      const id = labels[i]!;
      let outgoing = 0;
      for (const t of graph.outNeighbors(id)) {
        if (index.has(t)) outgoing++;
      }
      outOffsets[i + 1] = outgoing;
      let incoming = 0;
      for (const s of graph.inNeighbors(id)) {
        if (index.has(s)) incoming++;
      }
      inOffsets[i + 1] = incoming;
    }

    for (let i = 1; i <= n; i++) {
      outOffsets[i] = outOffsets[i]! + outOffsets[i - 1]!;
      inOffsets[i] = inOffsets[i]! + inOffsets[i - 1]!;
    }

    const e = outOffsets[n]!;
    const outTargets = new Int32Array(e);
    const inTargets = new Int32Array(inOffsets[n]!);
    const weights = weight ? new Float64Array(e) : undefined;
    const inWeights = weight ? new Float64Array(inOffsets[n]!) : undefined;

    const outCursor = new Int32Array(n);
    const inCursor = new Int32Array(n);

    for (let i = 0; i < n; i++) {
      const id = labels[i]!;
      for (const t of graph.outNeighbors(id)) {
        const j = index.get(t);
        if (j === undefined) continue;
        const k = outOffsets[i]! + outCursor[i]!;
        outTargets[k] = j;
        if (weights) weights[k] = weight!(id, t);
        outCursor[i] = outCursor[i]! + 1;
      }
      for (const s of graph.inNeighbors(id)) {
        const j = index.get(s);
        if (j === undefined) continue;
        const k = inOffsets[i]! + inCursor[i]!;
        inTargets[k] = j;
        if (inWeights) inWeights[k] = weight!(s, id);
        inCursor[i] = inCursor[i]! + 1;
      }
    }

    return weights && inWeights
      ? new Csr({
          outOffsets,
          outTargets,
          inOffsets,
          inTargets,
          labels,
          index,
          weights,
          inWeights,
        })
      : new Csr({
          outOffsets,
          outTargets,
          inOffsets,
          inTargets,
          labels,
          index,
        });
  }
}

/** {@link Csr.compile} 的便捷函数。 */
export function csr<G extends Catalog & Neighbors>(
  graph: G,
  weight?: (from: NodeId, to: NodeId) => number,
): Csr {
  return Csr.compile(graph, weight);
}
