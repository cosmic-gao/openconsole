import type { NodeId } from "../ident";
import type { Ints, Snapshot } from "../snapshot";
import { chain, Stepwise, type Task } from "../task";
import { scc, type Partition } from "./component";
import { dfs } from "./search";

/** `source` 是否可达 `target`。双向 BFS，相遇即停。 */
export function reachable(
  snapshot: Snapshot,
  source: NodeId,
  target: NodeId,
): boolean {
  const s = snapshot.indexOf(source);
  const t = snapshot.indexOf(target);
  if (s < 0 || t < 0) return false;
  if (s === t) return true;
  const { offset, other } = snapshot.outbound;
  const inbound = snapshot.inbound;
  if (inbound === undefined) {
    for (const node of dfs(snapshot, source)) if (node === target) return true;
    return false;
  }

  const forward = new Uint8Array(snapshot.order);
  const backward = new Uint8Array(snapshot.order);
  forward[s] = 1;
  backward[t] = 1;
  let ahead = [s];
  let behind = [t];

  while (ahead.length > 0 && behind.length > 0) {
    if (ahead.length <= behind.length) {
      const next: number[] = [];
      for (const u of ahead) {
        for (let k = offset[u]!; k < offset[u + 1]!; k++) {
          const v = other[k]!;
          if (backward[v] === 1) return true;
          if (forward[v] === 1) continue;
          forward[v] = 1;
          next.push(v);
        }
      }
      ahead = next;
    } else {
      const next: number[] = [];
      for (const u of behind) {
        for (let k = inbound.offset[u]!; k < inbound.offset[u + 1]!; k++) {
          const v = inbound.other[k]!;
          if (forward[v] === 1) return true;
          if (backward[v] === 1) continue;
          backward[v] = 1;
          next.push(v);
        }
      }
      behind = next;
    }
  }
  return false;
}

/** 沿出边可达的全部节点，不含自身。 */
export function descendants(snapshot: Snapshot, node: NodeId): NodeId[] {
  return beyond(dfs(snapshot, node), node);
}

/** 沿入边可达的全部节点，不含自身。 */
export function ancestors(snapshot: Snapshot, node: NodeId): NodeId[] {
  return beyond(dfs(snapshot.reverse(), node), node);
}

function beyond(walk: Generator<NodeId>, origin: NodeId): NodeId[] {
  const found: NodeId[] = [];
  for (const node of walk) if (node !== origin) found.push(node);
  return found;
}

/**
 * 可达性位图：按强连通分量存一行——同分量内所有节点的可达集完全相同。
 */
export class Closure {
  public constructor(
    private readonly _snapshot: Snapshot,
    private readonly _words: number,
    private readonly _component: Ints,
    private readonly _bits: Uint32Array,
  ) {}

  /** 索引空间的可达判定。 */
  public linked(from: number, to: number): boolean {
    const row = this._component[from]! * this._words;
    return (this._bits[row + (to >>> 5)]! & (1 << (to & 31))) !== 0;
  }

  public reaches(from: NodeId, to: NodeId): boolean {
    const u = this._snapshot.indexOf(from);
    const v = this._snapshot.indexOf(to);
    return u >= 0 && v >= 0 && this.linked(u, v);
  }

  /** `node` 的可达集。环上节点（含自环）包含自身，无环节点不含自身。 */
  public from(node: NodeId): NodeId[] {
    const u = this._snapshot.indexOf(node);
    if (u < 0) return [];
    const row = this._component[u]! * this._words;
    const found: NodeId[] = [];
    for (let w = 0; w < this._words; w++) {
      let word = this._bits[row + w]!;
      while (word !== 0) {
        const bit = 31 - Math.clz32(word & -word);
        found.push(this._snapshot.label((w << 5) + bit));
        word &= word - 1;
      }
    }
    return found;
  }
}

/**
 * 传递闭包，O(V + E·V/32)。
 *
 * 先缩点——{@link scc} 按逆拓扑序产出分量，因此处理某分量时它的后继分量都已算完，
 * 一遍位或即收敛，省掉"每个节点各跑一次可达搜索"的那个数量级。
 */
class Propagate extends Stepwise<Closure> {
  private readonly _words: number;
  private readonly _bits: Uint32Array;
  private readonly _members: number[][];
  private _component = 0;

  public constructor(
    private readonly _snapshot: Snapshot,
    private readonly _partition: Partition,
  ) {
    super();
    this._words = (_snapshot.order + 31) >>> 5;
    this._bits = new Uint32Array(_partition.count * this._words);
    this._members = Array.from({ length: _partition.count }, () => []);
    for (let u = 0; u < _snapshot.order; u++) {
      this._members[_partition.labels[u]!]!.push(u);
    }
  }

  public get progress(): number {
    return this._partition.count === 0
      ? 1
      : this._component / this._partition.count;
  }

  protected step(): boolean {
    if (this._component >= this._partition.count) return false;
    const c = this._component++;
    const row = c * this._words;
    const members = this._members[c]!;
    const labels = this._partition.labels;
    const { offset, other } = this._snapshot.outbound;
    // 多成员分量必然互相可达；单成员则看是否有自环。
    let internal = members.length > 1;

    for (const u of members) {
      for (let k = offset[u]!; k < offset[u + 1]!; k++) {
        const v = other[k]!;
        const target = labels[v]!;
        if (target === c) {
          internal = true;
          continue;
        }
        const cell = row + (v >>> 5);
        this._bits[cell] = this._bits[cell]! | (1 << (v & 31));
        const source = target * this._words;
        for (let w = 0; w < this._words; w++) {
          this._bits[row + w] = this._bits[row + w]! | this._bits[source + w]!;
        }
      }
    }
    if (internal) {
      for (const u of members) {
        const cell = row + (u >>> 5);
        this._bits[cell] = this._bits[cell]! | (1 << (u & 31));
      }
    }
    return this._component < this._partition.count;
  }

  public result(): Closure {
    this.ensure();
    return new Closure(
      this._snapshot,
      this._words,
      this._partition.labels,
      this._bits,
    );
  }
}

export const closure = (snapshot: Snapshot): Task<Closure> =>
  chain(scc(snapshot), (partition) => new Propagate(snapshot, partition));

/** 传递归约：去掉能由其他路径间接抵达的边。只对 DAG 有唯一解。 */
class Reduce extends Stepwise<Array<readonly [NodeId, NodeId]>> {
  private readonly _kept: Array<readonly [NodeId, NodeId]> = [];
  private _node = 0;

  public constructor(
    private readonly _snapshot: Snapshot,
    private readonly _closure: Closure,
  ) {
    super();
  }

  public get progress(): number {
    return this._snapshot.order === 0 ? 1 : this._node / this._snapshot.order;
  }

  protected step(): boolean {
    if (this._node >= this._snapshot.order) return false;
    const u = this._node++;
    const { offset, other } = this._snapshot.outbound;
    const targets = [...new Set(other.subarray(offset[u]!, offset[u + 1]!))];

    for (const v of targets) {
      const bypassed = targets.some(
        (rival) => rival !== v && this._closure.linked(rival, v),
      );
      if (!bypassed) {
        this._kept.push([this._snapshot.label(u), this._snapshot.label(v)]);
      }
    }
    return this._node < this._snapshot.order;
  }

  public result(): Array<readonly [NodeId, NodeId]> {
    this.ensure();
    return this._kept;
  }
}

export const reduction = (
  snapshot: Snapshot,
): Task<Array<readonly [NodeId, NodeId]>> =>
  chain(closure(snapshot), (closed) => new Reduce(snapshot, closed));
