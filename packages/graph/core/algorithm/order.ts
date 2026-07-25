import { Cycle } from "../error";
import type { NodeId } from "../ident";
import type { Snapshot } from "../snapshot";
import { Stepwise, transform, type Task } from "../task";

export interface Topology {
  /** 拓扑序，不含环上节点。 */
  readonly order: NodeId[];
  /** 参与环的节点；无环时为空。 */
  readonly cycle: NodeId[];
}

export interface Critical {
  readonly path: NodeId[];
  readonly length: number;
}

class Kahn extends Stepwise<Topology> {
  private readonly _pending: Int32Array;
  private readonly _queue: Int32Array;
  private readonly _sorted: number[] = [];
  private _head = 0;
  private _tail = 0;

  public constructor(private readonly _snapshot: Snapshot) {
    super();
    this._pending = indegrees(_snapshot);
    this._queue = new Int32Array(_snapshot.order);
    for (let u = 0; u < _snapshot.order; u++) {
      if (this._pending[u] === 0) this._queue[this._tail++] = u;
    }
  }

  public get progress(): number {
    return this._snapshot.order === 0
      ? 1
      : this._sorted.length / this._snapshot.order;
  }

  protected step(): boolean {
    if (this._head >= this._tail) return false;
    const u = this._queue[this._head++]!;
    this._sorted.push(u);

    const { offset, other } = this._snapshot.outbound;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const v = other[k]!;
      const left = this._pending[v]! - 1;
      this._pending[v] = left;
      if (left === 0) this._queue[this._tail++] = v;
    }
    return this._head < this._tail;
  }

  public result(): Topology {
    this.ensure();
    const order = this._sorted.map((u) => this._snapshot.label(u));
    const cycle: NodeId[] = [];
    if (order.length < this._snapshot.order) {
      for (let u = 0; u < this._snapshot.order; u++) {
        // 自环会把入度减到负数，故用 !== 0 而非 > 0。
        if (this._pending[u] !== 0) cycle.push(this._snapshot.label(u));
      }
    }
    return { order, cycle };
  }
}

function indegrees(snapshot: Snapshot): Int32Array {
  const pending = new Int32Array(snapshot.order);
  if (snapshot.inbound) {
    for (let u = 0; u < snapshot.order; u++) pending[u] = snapshot.inDegree(u);
    return pending;
  }
  const { offset, other } = snapshot.outbound;
  for (let k = 0; k < offset[snapshot.order]!; k++) {
    const v = other[k]!;
    pending[v] = pending[v]! + 1;
  }
  return pending;
}

/** 拓扑排序（Kahn），环不抛错而是单列出来。 */
export const topology = (snapshot: Snapshot): Task<Topology> =>
  new Kahn(snapshot);

/** 拓扑序。@throws {@link Cycle} 图中有环 */
export const toposort = (snapshot: Snapshot): Task<NodeId[]> =>
  transform(topology(snapshot), (result) => {
    if (result.cycle.length > 0) throw new Cycle(result.cycle);
    return result.order;
  });

export const acyclic = (snapshot: Snapshot): Task<boolean> =>
  transform(topology(snapshot), (result) => result.cycle.length === 0);

export const ranks = (snapshot: Snapshot): Task<Map<NodeId, number>> =>
  transform(
    toposort(snapshot),
    (order) => new Map(order.map((id, rank) => [id, rank])),
  );

/** 拓扑分层：同层节点互无依赖，可并行处理。@throws {@link Cycle} */
export const generations = (snapshot: Snapshot): Task<NodeId[][]> =>
  transform(toposort(snapshot), (order) => {
    const { offset, other } = snapshot.outbound;
    const level = new Int32Array(snapshot.order);
    const layers: NodeId[][] = [];

    for (const id of order) {
      const u = snapshot.indexOf(id);
      const depth = level[u]!;
      (layers[depth] ??= []).push(id);
      for (let k = offset[u]!; k < offset[u + 1]!; k++) {
        const v = other[k]!;
        if (level[v]! <= depth) level[v] = depth + 1;
      }
    }
    return layers;
  });

/** DAG 最长路。需要带权快照，否则每条边按 1 计。@throws {@link Cycle} */
export const criticalPath = (snapshot: Snapshot): Task<Critical> =>
  transform(toposort(snapshot), (order) => {
    const { offset, other, edge } = snapshot.outbound;
    const dist = new Float64Array(snapshot.order);
    const prev = new Int32Array(snapshot.order).fill(-1);
    let end = order.length > 0 ? snapshot.indexOf(order[0]!) : -1;

    for (const id of order) {
      const u = snapshot.indexOf(id);
      if (dist[u]! > dist[end]!) end = u;
      for (let k = offset[u]!; k < offset[u + 1]!; k++) {
        const v = other[k]!;
        const candidate = dist[u]! + snapshot.costAt(edge[k]!);
        if (candidate > dist[v]!) {
          dist[v] = candidate;
          prev[v] = u;
        }
      }
    }

    const path: NodeId[] = [];
    for (let cursor = end; cursor !== -1; cursor = prev[cursor]!) {
      path.push(snapshot.label(cursor));
    }
    return { path: path.reverse(), length: end === -1 ? 0 : dist[end]! };
  });
