import {
  afford,
  CEILING,
  reversed,
  type DenseOptions,
  type Ints,
  type Structure,
} from "../snapshot";
import { chain, Stepwise, type Task } from "../task";
import { scc, type Partition } from "./component";
import { dfs } from "./search";

/** `source` 是否可达 `target`。双向 BFS，相遇即停。 */
export function reachable(
  structure: Structure,
  source: number,
  target: number,
): boolean {
  const order = structure.order;
  if (source < 0 || target < 0 || source >= order || target >= order) {
    return false;
  }
  if (source === target) return true;
  const { offset, other } = structure.outbound;
  const inbound = structure.inbound;
  if (inbound === undefined) {
    for (const node of dfs(structure, source)) if (node === target) return true;
    return false;
  }

  const forward = new Uint8Array(order);
  const backward = new Uint8Array(order);
  forward[source] = 1;
  backward[target] = 1;
  let ahead = [source];
  let behind = [target];

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

/** 沿出边可达的全部节点索引，不含自身。 */
export function descendants(structure: Structure, node: number): Int32Array {
  return beyond(structure, dfs(structure, node), node);
}

/** 沿入边可达的全部节点索引，不含自身。 */
export function ancestors(structure: Structure, node: number): Int32Array {
  const back = reversed(structure);
  return beyond(structure, dfs(back, node), node);
}

function beyond(
  structure: Structure,
  walk: Generator<number>,
  origin: number,
): Int32Array {
  const found = new Int32Array(structure.order);
  let at = 0;
  for (const node of walk) if (node !== origin) found[at++] = node;
  return found.subarray(0, at);
}

/**
 * 可达性位图：按强连通分量存一行——同分量内所有节点的可达集完全相同。
 */
export class Closure {
  public constructor(
    private readonly _order: number,
    private readonly _words: number,
    private readonly _component: Ints,
    private readonly _bits: Uint32Array,
  ) {}

  /** `from` 是否可达 `to`。 */
  public linked(from: number, to: number): boolean {
    const row = this._component[from]! * this._words;
    return (this._bits[row + (to >>> 5)]! & (1 << (to & 31))) !== 0;
  }

  /** `node` 的可达集。环上节点（含自环）包含自身，无环节点不含自身；越界给空。 */
  public from(node: number): Int32Array {
    if (node < 0 || node >= this._order) return new Int32Array(0);
    const found = new Int32Array(this._order);
    let at = 0;
    const row = this._component[node]! * this._words;
    for (let w = 0; w < this._words; w++) {
      let word = this._bits[row + w]!;
      while (word !== 0) {
        const bit = 31 - Math.clz32(word & -word);
        found[at++] = (w << 5) + bit;
        word &= word - 1;
      }
    }
    return found.subarray(0, at);
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
    private readonly _structure: Structure,
    private readonly _partition: Partition,
    limit: number,
  ) {
    super();
    this._words = (_structure.order + 31) >>> 5;
    // 位图是 count × ⌈V/32⌉ 字：无环图上 count == order，于是这就是 O(V²/32)。
    // 闸门只能设在这里——分量数要等 scc 跑完才知道。
    afford(
      _partition.count * this._words * 4,
      limit,
      `closure on V=${_structure.order} with ${_partition.count} component(s)`,
    );
    this._bits = new Uint32Array(_partition.count * this._words);
    this._members = Array.from({ length: _partition.count }, () => []);
    for (let u = 0; u < _structure.order; u++) {
      this._members[_partition.component[u]!]!.push(u);
    }
  }

  protected measure(): number {
    return this._partition.count === 0
      ? 1
      : this._component / this._partition.count;
  }

  protected step(): boolean {
    if (this._component >= this._partition.count) return false;
    const c = this._component++;
    const row = c * this._words;
    const members = this._members[c]!;
    const labels = this._partition.component;
    const { offset, other } = this._structure.outbound;
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
      this._structure.order,
      this._words,
      this._partition.component,
      this._bits,
    );
  }
}

/**
 * 传递闭包，O(V + E·V/32)。
 *
 * @throws {@link Oversized} 位图超过 `limit`（默认 {@link CEILING}）——闸门在 scc 跑完、
 *   分量数已知之后才生效，因此错误出现在推进途中而不是构造时。
 */
export const closure = (
  structure: Structure,
  options: DenseOptions = {},
): Task<Closure> =>
  chain(
    scc(structure),
    (partition) =>
      new Propagate(structure, partition, options.limit ?? CEILING),
  );

/**
 * 传递归约：去掉能由其他路径间接抵达的边。只对 DAG 有唯一解。
 *
 * @remarks 一步只判一条候选边，单步因此是 O(deg)，与 Dijkstra 同阶。整节点一步的话单步
 *   就是 O(deg²)——扇出 4000 时一步要 155ms，`schedule` 的预算再小也让不出帧。
 */
class Reduce extends Stepwise<Array<readonly [number, number]>> {
  private readonly _kept: Array<readonly [number, number]> = [];
  private _node = 0;
  private _slot = 0;

  public constructor(
    private readonly _structure: Structure,
    private readonly _closure: Closure,
  ) {
    super();
  }

  protected measure(): number {
    const { order } = this._structure;
    const total = order + this._structure.outbound.offset[order]!;
    return total === 0 ? 1 : (this._node + this._slot) / total;
  }

  protected step(): boolean {
    const { order } = this._structure;
    if (this._node >= order) return false;

    const { offset, other } = this._structure.outbound;
    if (this._slot >= offset[this._node + 1]!) {
      this._node++;
      return this._node < order;
    }

    const u = this._node;
    const slot = this._slot++;
    const v = other[slot]!;
    if (!this._repeated(u, slot, v) && !this._bypassed(u, v)) {
      this._kept.push([u, v]);
    }
    return true;
  }

  /** 平行边只留一条：同一个 `v` 在本节点更早的槽位上已经判过。 */
  private _repeated(u: number, slot: number, v: number): boolean {
    const { offset, other } = this._structure.outbound;
    for (let k = offset[u]!; k < slot; k++) {
      if (other[k] === v) return true;
    }
    return false;
  }

  /** `v` 能否由 `u` 的另一个直接后继间接抵达。 */
  private _bypassed(u: number, v: number): boolean {
    const { offset, other } = this._structure.outbound;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const rival = other[k]!;
      if (rival !== v && this._closure.linked(rival, v)) return true;
    }
    return false;
  }

  public result(): Array<readonly [number, number]> {
    this.ensure();
    return this._kept;
  }
}

export const reduction = (
  structure: Structure,
  options: DenseOptions = {},
): Task<Array<readonly [number, number]>> =>
  chain(closure(structure, options), (closed) => new Reduce(structure, closed));
