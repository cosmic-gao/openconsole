import type { NodeId } from "../ident";
import type { Snapshot } from "../snapshot";
import { Stepwise, type Task } from "../task";

const NONE = -1;

export interface Bridge {
  readonly from: NodeId;
  readonly to: NodeId;
}

export interface Cuts {
  /** 删去后连通分量会增加的边。 */
  readonly bridges: Bridge[];
  /** 删去后连通分量会增加的节点。 */
  readonly articulations: NodeId[];
}

/**
 * 桥与割点（Tarjan，无向视角）。有向快照会自动合并两个方向；
 * 平行边靠边序号区分，因此两点间的重边不会被误判为桥。
 */
class Cut extends Stepwise<Cuts> {
  private readonly _discovered: Int32Array;
  private readonly _low: Int32Array;
  private readonly _cut: Uint8Array;
  private readonly _nodes: Int32Array;
  private readonly _via: Int32Array;
  private readonly _cursors: Int32Array;
  private readonly _children: Int32Array;
  private readonly _pending: Int32Array;
  private readonly _merged: boolean;
  private readonly _bridges: Bridge[] = [];
  private _depth = NONE;
  private _root = 0;
  private _clock = 0;
  private _other = 0;
  private _edge = 0;

  public constructor(private readonly _snapshot: Snapshot) {
    super();
    const n = _snapshot.order;
    this._discovered = new Int32Array(n).fill(NONE);
    this._low = new Int32Array(n);
    this._cut = new Uint8Array(n);
    this._nodes = new Int32Array(n);
    this._via = new Int32Array(n);
    this._cursors = new Int32Array(n);
    this._children = new Int32Array(n);
    this._pending = new Int32Array(n);
    this._merged = _snapshot.merged;
  }

  public get progress(): number {
    return this._snapshot.order === 0 ? 1 : this._clock / this._snapshot.order;
  }

  protected step(): boolean {
    if (this._depth === NONE) {
      while (
        this._root < this._snapshot.order &&
        this._discovered[this._root] !== NONE
      ) {
        this._root++;
      }
      if (this._root >= this._snapshot.order) return false;
      this._enter(this._root, NONE);
      return true;
    }

    const u = this._nodes[this._depth]!;
    const child = this._pending[this._depth]!;
    if (child !== NONE) {
      this._pending[this._depth] = NONE;
      if (this._low[child]! < this._low[u]!) this._low[u] = this._low[child]!;
      if (this._low[child]! > this._discovered[u]!) {
        this._bridges.push({
          from: this._snapshot.label(u),
          to: this._snapshot.label(child),
        });
      }
      if (
        this._via[this._depth] !== NONE &&
        this._low[child]! >= this._discovered[u]!
      ) {
        this._cut[u] = 1;
      }
    }

    while (this._select(u, this._cursors[this._depth]!)) {
      this._cursors[this._depth] = this._cursors[this._depth]! + 1;
      // 不沿来路返回，但平行边（另一个边序号）仍算作返祖边。
      if (this._edge === this._via[this._depth] || this._other === u) continue;
      if (this._discovered[this._other] === NONE) {
        this._children[this._depth] = this._children[this._depth]! + 1;
        this._pending[this._depth] = this._other;
        this._enter(this._other, this._edge);
        return true;
      }
      if (this._discovered[this._other]! < this._low[u]!) {
        this._low[u] = this._discovered[this._other]!;
      }
    }

    if (this._via[this._depth] === NONE && this._children[this._depth]! >= 2) {
      this._cut[u] = 1;
    }
    this._depth--;
    return true;
  }

  /** 把关联边（出边在前、入边在后）按序号取到 `_other` / `_edge`。 */
  private _select(u: number, index: number): boolean {
    const { offset, other, edge } = this._snapshot.outbound;
    const inbound = this._snapshot.inbound;
    const outgoing = offset[u + 1]! - offset[u]!;
    if (index < outgoing) {
      const k = offset[u]! + index;
      this._other = other[k]!;
      this._edge = edge[k]!;
      return true;
    }
    if (this._merged || inbound === undefined) return false;
    const rest = index - outgoing;
    if (rest >= inbound.offset[u + 1]! - inbound.offset[u]!) return false;
    const slot = inbound.offset[u]! + rest;
    this._other = inbound.other[slot]!;
    this._edge = inbound.edge[slot]!;
    return true;
  }

  private _enter(u: number, via: number): void {
    this._discovered[u] = this._low[u] = this._clock++;
    this._depth++;
    this._nodes[this._depth] = u;
    this._via[this._depth] = via;
    this._cursors[this._depth] = 0;
    this._children[this._depth] = 0;
    this._pending[this._depth] = NONE;
  }

  public result(): Cuts {
    this.ensure();
    const articulations: NodeId[] = [];
    for (let u = 0; u < this._snapshot.order; u++) {
      if (this._cut[u] === 1) articulations.push(this._snapshot.label(u));
    }
    return { bridges: this._bridges, articulations };
  }
}

export const cuts = (snapshot: Snapshot): Task<Cuts> => new Cut(snapshot);

/**
 * 支配树（Lengauer-Tarjan）。只覆盖从 `entry` 可达的节点，`entry` 的直接支配点是自身。
 * 三个阶段——DFS 编号、半支配点、最终 idom——共享一个游标，可在任意阶段中断。
 */
class Dominators extends Stepwise<Map<NodeId, NodeId>> {
  private readonly _order: Int32Array;
  private readonly _number: Int32Array;
  private readonly _parent: Int32Array;
  private readonly _semi: Int32Array;
  private readonly _ancestor: Int32Array;
  private readonly _label: Int32Array;
  private readonly _bucket: number[][];
  private readonly _idom: Int32Array;
  private readonly _stack: Int32Array;
  private readonly _cursors: Int32Array;
  private _depth = 0;
  private _counted = 0;
  private _phase = 0;
  private _cursor = 0;

  public constructor(
    private readonly _snapshot: Snapshot,
    entry: NodeId,
  ) {
    super();
    const n = _snapshot.order;
    this._order = new Int32Array(n).fill(NONE);
    this._number = new Int32Array(n).fill(NONE);
    this._parent = new Int32Array(n).fill(NONE);
    this._semi = new Int32Array(n);
    this._ancestor = new Int32Array(n).fill(NONE);
    this._label = new Int32Array(n);
    this._bucket = Array.from({ length: n }, () => []);
    this._idom = new Int32Array(n).fill(NONE);
    this._stack = new Int32Array(n);
    this._cursors = new Int32Array(n);

    const root = _snapshot.indexOf(entry);
    if (root < 0) {
      this._phase = 3;
      return;
    }
    this._number[root] = 0;
    this._order[0] = root;
    this._counted = 1;
    this._stack[0] = root;
    this._cursors[0] = _snapshot.outbound.offset[root]!;
    this._depth = 1;
  }

  public get progress(): number {
    return this._phase >= 3 ? 1 : (this._phase + this._fraction()) / 3;
  }

  private _fraction(): number {
    if (this._counted === 0) return 0;
    return this._phase === 0
      ? this._counted / this._snapshot.order
      : this._cursor / this._counted;
  }

  protected step(): boolean {
    switch (this._phase) {
      case 0:
        return this._number1();
      case 1:
        return this._semidominate();
      case 2:
        return this._finish();
      default:
        return false;
    }
  }

  /** 阶段 0：DFS 先序编号。 */
  private _number1(): boolean {
    if (this._depth === 0) {
      for (let i = 0; i < this._counted; i++) {
        this._semi[i] = i;
        this._label[i] = i;
      }
      this._phase = 1;
      this._cursor = this._counted - 1;
      return true;
    }

    const top = this._depth - 1;
    const u = this._stack[top]!;
    const { offset, other } = this._snapshot.outbound;
    if (this._cursors[top]! >= offset[u + 1]!) {
      this._depth--;
      return true;
    }
    const k = this._cursors[top]!;
    this._cursors[top] = k + 1;
    const v = other[k]!;
    if (this._number[v] === NONE) {
      const index = this._counted++;
      this._number[v] = index;
      this._order[index] = v;
      this._parent[index] = this._number[u]!;
      this._stack[this._depth] = v;
      this._cursors[this._depth] = offset[v]!;
      this._depth++;
    }
    return true;
  }

  /** 阶段 1：逆先序求半支配点并填桶。 */
  private _semidominate(): boolean {
    if (this._cursor <= 0) {
      this._phase = 2;
      this._cursor = 1;
      return true;
    }
    const w = this._cursor--;
    for (const u of this._predecessors(w)) {
      const candidate = this._evaluate(u);
      if (this._semi[candidate]! < this._semi[w]!) {
        this._semi[w] = this._semi[candidate]!;
      }
    }
    this._bucket[this._semi[w]!]!.push(w);
    this._ancestor[w] = this._parent[w]!;

    const parent = this._parent[w]!;
    const waiting = this._bucket[parent]!;
    for (const v of waiting) {
      const candidate = this._evaluate(v);
      this._idom[v] =
        this._semi[candidate]! < this._semi[v]! ? candidate : parent;
    }
    waiting.length = 0;
    return true;
  }

  /** 阶段 2：把间接支配点收敛成直接支配点。 */
  private _finish(): boolean {
    if (this._cursor >= this._counted) {
      this._phase = 3;
      return false;
    }
    const w = this._cursor++;
    if (this._idom[w] !== this._semi[w]) {
      this._idom[w] = this._idom[this._idom[w]!]!;
    }
    return true;
  }

  private *_predecessors(w: number): Generator<number> {
    const node = this._order[w]!;
    const inbound = this._snapshot.inbound;
    if (inbound === undefined) return;
    for (let k = inbound.offset[node]!; k < inbound.offset[node + 1]!; k++) {
      const number = this._number[inbound.other[k]!]!;
      if (number !== NONE) yield number;
    }
  }

  private _evaluate(v: number): number {
    if (this._ancestor[v] === NONE) return v;
    this._compress(v);
    return this._label[v]!;
  }

  private _compress(v: number): void {
    const path: number[] = [];
    let cursor = v;
    while (this._ancestor[this._ancestor[cursor]!] !== NONE) {
      path.push(cursor);
      cursor = this._ancestor[cursor]!;
    }
    for (let i = path.length - 1; i >= 0; i--) {
      const w = path[i]!;
      const ancestor = this._ancestor[w]!;
      if (this._semi[this._label[ancestor]!]! < this._semi[this._label[w]!]!) {
        this._label[w] = this._label[ancestor]!;
      }
      this._ancestor[w] = this._ancestor[ancestor]!;
    }
  }

  public result(): Map<NodeId, NodeId> {
    this.ensure();
    const tree = new Map<NodeId, NodeId>();
    if (this._counted === 0) return tree;
    tree.set(
      this._snapshot.label(this._order[0]!),
      this._snapshot.label(this._order[0]!),
    );
    for (let w = 1; w < this._counted; w++) {
      tree.set(
        this._snapshot.label(this._order[w]!),
        this._snapshot.label(this._order[this._idom[w]!]!),
      );
    }
    return tree;
  }
}

export const dominators = (
  snapshot: Snapshot,
  entry: NodeId,
): Task<Map<NodeId, NodeId>> => new Dominators(snapshot, entry);
