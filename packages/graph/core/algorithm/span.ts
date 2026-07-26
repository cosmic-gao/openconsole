import { LazyQueue } from "@openconsole/queue";

import {
  costOf,
  merged,
  type Adjacency,
  type Reals,
  type Structure,
} from "../snapshot";
import { Stepwise, type Task } from "../task";

const NONE = -1;

/** 最小生成森林里选中的一条边，全部是索引。 */
export interface Link {
  readonly source: number;
  readonly target: number;
  readonly weight: number;
  /** 边序号，用 `snapshot.edges[edge]` 换回 id。 */
  readonly edge: number;
}

/**
 * Prim：按无向视角逐个分量扩展。优先队列排的是**节点**——每个尚未入树的节点只记
 * "到树的最小跨边"一条，因此队列规模是 O(V) 而不是 O(E)。
 */
class Prim extends Stepwise<Link[]> {
  private readonly _reach: Float64Array;
  private readonly _from: Int32Array;
  private readonly _slot: Int32Array;
  private readonly _inTree: Uint8Array;
  /** 需要额外扫的反向邻接；无向结构两侧同源，留空即可。 */
  private readonly _inbound: Adjacency | undefined;
  private readonly _weight: Reals | undefined;
  private readonly _queue = new LazyQueue();
  private readonly _links: Link[] = [];
  private _root = 0;
  private _seen = 0;

  public constructor(private readonly _structure: Structure) {
    super();
    const n = _structure.order;
    this._reach = new Float64Array(n).fill(Infinity);
    this._from = new Int32Array(n).fill(NONE);
    this._slot = new Int32Array(n).fill(NONE);
    this._inTree = new Uint8Array(n);
    this._inbound = merged(_structure) ? undefined : _structure.inbound;
    this._weight = _structure.weight;
  }

  public get progress(): number {
    return this._structure.order === 0 ? 1 : this._seen / this._structure.order;
  }

  protected step(): boolean {
    const u = this._queue.poll();
    if (u === NONE) {
      while (
        this._root < this._structure.order &&
        this._inTree[this._root] === 1
      ) {
        this._root++;
      }
      if (this._root >= this._structure.order) return false;
      this._reach[this._root] = 0;
      this._queue.push(this._root, 0);
      return true;
    }
    if (this._inTree[u] === 1) return true;
    this._inTree[u] = 1;
    this._seen++;

    if (this._from[u] !== NONE) {
      this._links.push({
        source: this._from[u]!,
        target: u,
        weight: this._reach[u]!,
        edge: this._slot[u]!,
      });
    }

    const { offset, other, edge } = this._structure.outbound;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      this._offer(u, other[k]!, edge[k]!);
    }
    const inbound = this._inbound;
    if (inbound) {
      for (let k = inbound.offset[u]!; k < inbound.offset[u + 1]!; k++) {
        this._offer(u, inbound.other[k]!, inbound.edge[k]!);
      }
    }
    return true;
  }

  private _offer(from: number, to: number, slot: number): void {
    if (this._inTree[to] === 1) return;
    const weight = this._weight;
    const cost = weight === undefined ? 1 : weight[slot]!;
    if (cost >= this._reach[to]!) return;
    this._reach[to] = cost;
    this._from[to] = from;
    this._slot[to] = slot;
    this._queue.push(to, cost);
  }

  public result(): Link[] {
    this.ensure();
    return this._links;
  }
}

/** Kruskal：边按权升序合并，并查集判环。 */
class Kruskal extends Stepwise<Link[]> {
  private readonly _sorted: Int32Array;
  private readonly _tail: Int32Array;
  private readonly _head: Int32Array;
  private readonly _parent: Int32Array;
  private readonly _weight: Reals | undefined;
  private readonly _links: Link[] = [];
  private _cursor = 0;

  public constructor(structure: Structure) {
    super();
    const size = structure.size;
    this._tail = new Int32Array(size).fill(NONE);
    this._head = new Int32Array(size);
    this._parent = new Int32Array(structure.order);
    this._weight = structure.weight;
    for (let u = 0; u < structure.order; u++) this._parent[u] = u;

    const { offset, other, edge } = structure.outbound;
    for (let u = 0; u < structure.order; u++) {
      for (let k = offset[u]!; k < offset[u + 1]!; k++) {
        const e = edge[k]!;
        // 无向结构里同一条边出现两次，只认第一次。
        if (this._tail[e] !== NONE) continue;
        this._tail[e] = u;
        this._head[e] = other[k]!;
      }
    }
    this._sorted = Int32Array.from({ length: size }, (_, e) => e).sort(
      (a, b) => costOf(structure, a) - costOf(structure, b),
    );
  }

  public get progress(): number {
    return this._sorted.length === 0 ? 1 : this._cursor / this._sorted.length;
  }

  protected step(): boolean {
    if (this._cursor >= this._sorted.length) return false;
    const e = this._sorted[this._cursor++]!;
    if (this._tail[e] !== NONE) {
      const a = this._find(this._tail[e]!);
      const b = this._find(this._head[e]!);
      if (a !== b) {
        this._parent[a] = b;
        const weight = this._weight;
        this._links.push({
          source: this._tail[e]!,
          target: this._head[e]!,
          weight: weight === undefined ? 1 : weight[e]!,
          edge: e,
        });
      }
    }
    return this._cursor < this._sorted.length;
  }

  private _find(u: number): number {
    let root = u;
    while (this._parent[root] !== root) root = this._parent[root]!;
    let cursor = u;
    while (cursor !== root) {
      const next = this._parent[cursor]!;
      this._parent[cursor] = root;
      cursor = next;
    }
    return root;
  }

  public result(): Link[] {
    this.ensure();
    return this._links;
  }
}

/** 最小生成森林（Prim）。非连通图给出每个分量各自的最小生成树。 */
export const prim = (structure: Structure): Task<Link[]> => new Prim(structure);

/** 最小生成森林（Kruskal）。 */
export const kruskal = (structure: Structure): Task<Link[]> =>
  new Kruskal(structure);
