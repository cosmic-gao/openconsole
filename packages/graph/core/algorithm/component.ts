import type { NodeId } from "../ident";
import type { Adjacency, Ints, Snapshot } from "../snapshot";
import { Stepwise, transform, type Task } from "../task";

const NONE = -1;

/** 分量划分：`labels[u]` 是节点索引 `u` 所属分量的编号。 */
export class Partition {
  public constructor(
    public readonly count: number,
    public readonly labels: Ints,
    private readonly _snapshot: Snapshot,
  ) {}

  /** 未知节点返回 -1。 */
  public of(node: NodeId): number {
    const u = this._snapshot.indexOf(node);
    return u < 0 ? NONE : this.labels[u]!;
  }

  public groups(): NodeId[][] {
    const grouped: NodeId[][] = Array.from({ length: this.count }, () => []);
    for (let u = 0; u < this.labels.length; u++) {
      grouped[this.labels[u]!]!.push(this._snapshot.label(u));
    }
    return grouped;
  }
}

/** 弱连通分量：忽略边方向。 */
class Weak extends Stepwise<Partition> {
  private readonly _component: Int32Array;
  private readonly _stack: Int32Array;
  /** 需要额外扫的反向邻接；无向快照两侧同源，留空即可。 */
  private readonly _inbound: Adjacency | undefined;
  private _top = 0;
  private _root = 0;
  private _count = 0;
  private _seen = 0;

  public constructor(private readonly _snapshot: Snapshot) {
    super();
    this._component = new Int32Array(_snapshot.order).fill(NONE);
    this._stack = new Int32Array(_snapshot.order);
    this._inbound = _snapshot.merged ? undefined : _snapshot.inbound;
  }

  public get progress(): number {
    return this._snapshot.order === 0 ? 1 : this._seen / this._snapshot.order;
  }

  protected step(): boolean {
    if (this._top === 0) {
      while (
        this._root < this._snapshot.order &&
        this._component[this._root] !== NONE
      ) {
        this._root++;
      }
      if (this._root >= this._snapshot.order) return false;
      this._claim(this._root, this._count++);
      return true;
    }

    const u = this._stack[--this._top]!;
    const label = this._component[u]!;
    const { offset, other } = this._snapshot.outbound;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      this._claim(other[k]!, label);
    }
    const inbound = this._inbound;
    if (inbound) {
      for (let k = inbound.offset[u]!; k < inbound.offset[u + 1]!; k++) {
        this._claim(inbound.other[k]!, label);
      }
    }
    return true;
  }

  private _claim(u: number, label: number): void {
    if (this._component[u] !== NONE) return;
    this._component[u] = label;
    this._stack[this._top++] = u;
    this._seen++;
  }

  public result(): Partition {
    this.ensure();
    return new Partition(this._count, this._component, this._snapshot);
  }
}

/**
 * 强连通分量（Pearce 2016 迭代算法）。DFS 栈是四条平行 `Int32Array`，每帧零分配，
 * 因此整个搜索过程都能安全地在任意一步暂停。分量编号按逆拓扑序递增。
 */
class Strong extends Stepwise<Partition> {
  /** 0 未访问；正数为先序值（随后被低链值压低）；负数表示已归入分量。 */
  private readonly _rindex: Int32Array;
  private readonly _component: Int32Array;
  private readonly _nodes: Int32Array;
  private readonly _marks: Int32Array;
  private readonly _cursors: Int32Array;
  private readonly _pending: Int32Array;
  private readonly _path: Int32Array;
  private _pathTop = 0;
  private _depth = NONE;
  private _root = 0;
  private _preorder = 1;
  private _count = 0;
  private _settledNodes = 0;

  public constructor(private readonly _snapshot: Snapshot) {
    super();
    const n = _snapshot.order;
    this._rindex = new Int32Array(n);
    this._component = new Int32Array(n).fill(NONE);
    this._nodes = new Int32Array(n);
    this._marks = new Int32Array(n);
    this._cursors = new Int32Array(n);
    this._pending = new Int32Array(n);
    this._path = new Int32Array(n);
  }

  public get progress(): number {
    return this._snapshot.order === 0
      ? 1
      : this._settledNodes / this._snapshot.order;
  }

  protected step(): boolean {
    if (this._depth === NONE) {
      while (
        this._root < this._snapshot.order &&
        this._rindex[this._root] !== 0
      ) {
        this._root++;
      }
      if (this._root >= this._snapshot.order) return false;
      this._enter(this._root);
      return true;
    }

    const u = this._nodes[this._depth]!;
    const child = this._pending[this._depth]!;
    if (child !== NONE) {
      this._pending[this._depth] = NONE;
      const low = this._rindex[child]!;
      if (low > 0 && low < this._rindex[u]!) this._rindex[u] = low;
    }

    const { offset, other } = this._snapshot.outbound;
    const end = offset[u + 1]!;
    let cursor = this._cursors[this._depth]!;
    while (cursor < end) {
      const v = other[cursor]!;
      cursor++;
      const mark = this._rindex[v]!;
      if (mark === 0) {
        this._cursors[this._depth] = cursor;
        this._pending[this._depth] = v;
        this._enter(v);
        return true;
      }
      if (mark > 0 && mark < this._rindex[u]!) this._rindex[u] = mark;
    }
    this._cursors[this._depth] = cursor;

    // 低链值没有被压低 ⇒ u 是分量根，弹出它之上的全部候选成员。
    if (this._rindex[u] === this._marks[this._depth]) {
      const label = this._count++;
      let member: number;
      do {
        member = this._path[--this._pathTop]!;
        this._rindex[member] = -(label + 1);
        this._component[member] = label;
        this._settledNodes++;
      } while (member !== u);
    }
    this._depth--;
    return true;
  }

  private _enter(u: number): void {
    const mark = this._preorder++;
    this._rindex[u] = mark;
    this._depth++;
    this._nodes[this._depth] = u;
    this._marks[this._depth] = mark;
    this._cursors[this._depth] = this._snapshot.outbound.offset[u]!;
    this._pending[this._depth] = NONE;
    this._path[this._pathTop++] = u;
  }

  public result(): Partition {
    this.ensure();
    return new Partition(this._count, this._component, this._snapshot);
  }
}

export const components = (snapshot: Snapshot): Task<Partition> =>
  new Weak(snapshot);

export const scc = (snapshot: Snapshot): Task<Partition> =>
  new Strong(snapshot);

export interface Condensed {
  readonly partition: Partition;
  /** 分量间的去重有向边。 */
  readonly edges: Array<readonly [number, number]>;
}

/** 缩点：每个强连通分量收缩成一个节点，得到无环的凝聚图。 */
export const condensation = (snapshot: Snapshot): Task<Condensed> =>
  transform(scc(snapshot), (partition) => {
    const { order } = snapshot;
    const { offset, other } = snapshot.outbound;
    const seen = new Set<number>();
    const edges: Array<readonly [number, number]> = [];
    for (let u = 0; u < order; u++) {
      const from = partition.labels[u]!;
      for (let k = offset[u]!; k < offset[u + 1]!; k++) {
        const to = partition.labels[other[k]!]!;
        if (to === from) continue;
        const key = from * partition.count + to;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push([from, to]);
      }
    }
    return { partition, edges };
  });

/** 枚举全部简单环（Johnson）。环的数量可能随规模爆炸，务必配合中断使用。 */
class Cycles extends Stepwise<NodeId[][]> {
  private readonly _blocked: Uint8Array;
  private readonly _noEntry: number[][];
  private readonly _path: number[] = [];
  private readonly _frames: number[] = [];
  private readonly _cursors: number[] = [];
  private readonly _found: boolean[] = [];
  private readonly _cycles: number[][] = [];
  private _start = 0;

  public constructor(private readonly _snapshot: Snapshot) {
    super();
    this._blocked = new Uint8Array(_snapshot.order);
    this._noEntry = Array.from({ length: _snapshot.order }, () => []);
  }

  public get progress(): number {
    return this._snapshot.order === 0 ? 1 : this._start / this._snapshot.order;
  }

  protected step(): boolean {
    if (this._frames.length === 0) {
      if (this._start >= this._snapshot.order) return false;
      this._blocked.fill(0);
      for (const list of this._noEntry) list.length = 0;
      this._enter(this._start);
      return true;
    }

    const top = this._frames.length - 1;
    const u = this._frames[top]!;
    const { offset, other } = this._snapshot.outbound;
    const end = offset[u + 1]!;

    if (this._cursors[top]! < end) {
      const v = other[this._cursors[top]!++]!;
      if (v < this._start) return true;
      if (v === this._start) {
        this._cycles.push([...this._path]);
        this._found[top] = true;
      } else if (this._blocked[v] === 0) {
        this._enter(v);
      }
      return true;
    }

    if (this._found[top]) {
      this._unblock(u);
    } else {
      for (let k = offset[u]!; k < end; k++) {
        const v = other[k]!;
        if (v >= this._start && !this._noEntry[v]!.includes(u)) {
          this._noEntry[v]!.push(u);
        }
      }
    }

    this._frames.pop();
    this._cursors.pop();
    this._path.pop();
    const found = this._found.pop()!;
    if (found && this._frames.length > 0) {
      this._found[this._frames.length - 1] = true;
    }
    if (this._frames.length === 0) this._start++;
    return true;
  }

  private _enter(u: number): void {
    this._path.push(u);
    this._blocked[u] = 1;
    this._frames.push(u);
    this._cursors.push(this._snapshot.outbound.offset[u]!);
    this._found.push(false);
  }

  private _unblock(root: number): void {
    const waiting = [root];
    while (waiting.length > 0) {
      const u = waiting.pop()!;
      this._blocked[u] = 0;
      const dependents = this._noEntry[u]!;
      for (const blocked of dependents) {
        if (this._blocked[blocked] === 1) waiting.push(blocked);
      }
      dependents.length = 0;
    }
  }

  public result(): NodeId[][] {
    this.ensure();
    return this._cycles.map((cycle) =>
      cycle.map((u) => this._snapshot.label(u)),
    );
  }
}

export const simpleCycles = (snapshot: Snapshot): Task<NodeId[][]> =>
  new Cycles(snapshot);
