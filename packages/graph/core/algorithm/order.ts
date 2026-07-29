import { Cycle, Invalid } from "../error";
import type { Structure } from "../snapshot";
import { Stepwise, transform, type Task } from "../task";

export interface Topology {
  /** 拓扑序的节点索引，不含环上节点。 */
  readonly order: Int32Array;
  /** 参与环的节点索引；无环时为空。 */
  readonly cycle: Int32Array;
}

export interface Critical {
  readonly path: Int32Array;
  readonly length: number;
}

/**
 * Kahn 拓扑排序。
 *
 * @remarks 出队序列本身就是拓扑序，因此不再单独攒一份结果数组——`_queue` 前 `_tail`
 *   项即答案。
 */
class Kahn extends Stepwise<Topology> {
  /** 首步才建：缺入向邻接时入度要 O(E) 扫出来，摆在构造函数里就成了不可中断的准备段。 */
  private _pending: Int32Array | undefined;
  private readonly _queue: Int32Array;
  private _head = 0;
  private _tail = 0;

  public constructor(private readonly _structure: Structure) {
    super();
    this._queue = new Int32Array(_structure.order);
  }

  protected measure(): number {
    return this._structure.order === 0 ? 1 : this._head / this._structure.order;
  }

  private _open(): Int32Array {
    const pending = indegrees(this._structure);
    for (let u = 0; u < this._structure.order; u++) {
      if (pending[u] === 0) this._queue[this._tail++] = u;
    }
    return pending;
  }

  protected step(): boolean {
    const pending = (this._pending ??= this._open());
    if (this._head >= this._tail) return false;
    const u = this._queue[this._head++]!;

    const { offset, other } = this._structure.outbound;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const v = other[k]!;
      const left = pending[v]! - 1;
      pending[v] = left;
      if (left === 0) this._queue[this._tail++] = v;
    }
    return this._head < this._tail;
  }

  public result(): Topology {
    this.ensure();
    // 跑完必然经过首步，`_pending` 已建；空图也会推进一次空步。
    const pending = this._pending ?? EMPTY;
    const order = this._queue.subarray(0, this._tail);
    if (this._tail === this._structure.order) {
      return { order, cycle: EMPTY };
    }
    const cycle = new Int32Array(this._structure.order - this._tail);
    let at = 0;
    for (let u = 0; u < this._structure.order; u++) {
      // 自环会把入度减到负数，故用 !== 0 而非 > 0。
      if (pending[u] !== 0) cycle[at++] = u;
    }
    return { order, cycle: cycle.subarray(0, at) };
  }
}

const EMPTY = new Int32Array(0);

function indegrees(structure: Structure): Int32Array {
  const pending = new Int32Array(structure.order);
  const inbound = structure.inbound;
  if (inbound && inbound !== structure.outbound) {
    for (let u = 0; u < structure.order; u++) {
      pending[u] = inbound.offset[u + 1]! - inbound.offset[u]!;
    }
    return pending;
  }
  const { offset, other } = structure.outbound;
  for (let k = 0; k < offset[structure.order]!; k++) {
    const v = other[k]!;
    pending[v] = pending[v]! + 1;
  }
  return pending;
}

/** 拓扑排序（Kahn），环不抛错而是单列出来。 */
export const topology = (structure: Structure): Task<Topology> =>
  new Kahn(structure);

/** 拓扑序的节点索引。@throws {@link Cycle} 图中有环 */
export const toposort = (structure: Structure): Task<Int32Array> =>
  transform(topology(structure), (result) => {
    if (result.cycle.length > 0) throw new Cycle(Array.from(result.cycle));
    return result.order;
  });

export const acyclic = (structure: Structure): Task<boolean> =>
  transform(topology(structure), (result) => result.cycle.length === 0);

/** 每个节点在拓扑序里的位次，下标即节点索引。@throws {@link Cycle} */
export const ranks = (structure: Structure): Task<Int32Array> =>
  transform(toposort(structure), (order) => {
    const rank = new Int32Array(structure.order);
    for (let i = 0; i < order.length; i++) rank[order[i]!] = i;
    return rank;
  });

/** 拓扑分层：同层节点互无依赖，可并行处理。@throws {@link Cycle} */
export const generations = (structure: Structure): Task<Int32Array[]> =>
  transform(toposort(structure), (order) => {
    const { offset, other } = structure.outbound;
    const level = new Int32Array(structure.order);
    let deepest = 0;

    for (let i = 0; i < order.length; i++) {
      const u = order[i]!;
      const depth = level[u]!;
      if (depth > deepest) deepest = depth;
      for (let k = offset[u]!; k < offset[u + 1]!; k++) {
        const v = other[k]!;
        if (level[v]! <= depth) level[v] = depth + 1;
      }
    }

    const width = new Int32Array(deepest + 1);
    for (let i = 0; i < order.length; i++) {
      const d = level[order[i]!]!;
      width[d] = width[d]! + 1;
    }
    const layers: Int32Array[] = new Array(deepest + 1);
    for (let d = 0; d <= deepest; d++) layers[d] = new Int32Array(width[d]!);
    const cursor = new Int32Array(deepest + 1);
    for (let i = 0; i < order.length; i++) {
      const u = order[i]!;
      const d = level[u]!;
      const at = cursor[d]!;
      cursor[d] = at + 1;
      layers[d]![at] = u;
    }
    return layers;
  });

/**
 * DAG 最长路。需要带权结构，否则每条边按 1 计。
 *
 * @throws {@link Cycle} 图中有环
 * @throws {@link Invalid} 存在 `NaN` 权边——`NaN` 比不过任何候选，放过去只会静默漏掉整段路径
 */
export const criticalPath = (structure: Structure): Task<Critical> =>
  transform(toposort(structure), (order) => {
    const { offset, other, edge } = structure.outbound;
    const weight = structure.weight;
    const dist = new Float64Array(structure.order);
    const prev = new Int32Array(structure.order).fill(-1);
    let end = order.length > 0 ? order[0]! : -1;

    for (let i = 0; i < order.length; i++) {
      const u = order[i]!;
      if (dist[u]! > dist[end]!) end = u;
      for (let k = offset[u]!; k < offset[u + 1]!; k++) {
        const v = other[k]!;
        const cost = weight === undefined ? 1 : weight[edge[k]!]!;
        if (Number.isNaN(cost)) throw new Invalid(edge[k]!);
        const candidate = dist[u]! + cost;
        if (candidate > dist[v]!) {
          dist[v] = candidate;
          prev[v] = u;
        }
      }
    }

    let depth = 0;
    for (let cursor = end; cursor !== -1; cursor = prev[cursor]!) depth++;
    const path = new Int32Array(depth);
    for (let cursor = end; cursor !== -1; cursor = prev[cursor]!) {
      path[--depth] = cursor;
    }
    return { path, length: end === -1 ? 0 : dist[end]! };
  });
