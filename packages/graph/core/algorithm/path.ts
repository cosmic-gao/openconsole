import { BucketQueue, LazyQueue, type IndexQueue } from "@openconsole/queue";

import { Cycle, Negative } from "../error";
import type { NodeId } from "../ident";
import type { Snapshot } from "../snapshot";
import { Stepwise, transform, type Task } from "../task";

/**
 * 路径代价的合成方式。Dijkstra 的贪心要求 `combine(total, step) >= total`，
 * 满足这一点的语义都能复用同一份实现，无需另写算法。
 */
export type Combine = (total: number, step: number) => number;

/** 常规最短路：代价累加。 */
export const sum: Combine = (total, step) => total + step;

/** 瓶颈路径：代价取路径上最重的一段，求"最大边权最小"的路线。 */
export const bottleneck: Combine = (total, step) =>
  step > total ? step : total;

/** 最短路径树，下标即节点索引。 */
export interface Tree {
  /** 不可达为 `Infinity`。 */
  readonly distance: Float64Array;
  /** 前驱节点索引，无前驱为 -1。 */
  readonly parent: Int32Array;
}

export interface Route {
  readonly distance: number;
  readonly path: NodeId[];
}

export interface PathOptions {
  combine?: Combine;
}

/** 桶队列上限：超过它桶数组与空桶扫描都不再划算。 */
const BUCKETS = 1 << 16;

/**
 * 挑选优先队列，顺手校验负权。非负整数权且内置 combine 保证增量有界时用桶队列
 * （O(1) 出入队），否则用惰性堆。两者给出的距离一致，只影响耗时。
 */
function pick(snapshot: Snapshot, combine: Combine): IndexQueue {
  const weight = snapshot.weight;
  if (!weight) return new BucketQueue(snapshot.order, 1);

  let integral = true;
  let max = 0;
  for (let e = 0; e < weight.length; e++) {
    const cost = weight[e]!;
    if (cost < 0) throw new Negative(cost, snapshot.edges[e]!);
    if (integral && !Number.isInteger(cost)) integral = false;
    if (cost > max) max = cost;
  }
  // 自定义 combine 可能把优先级推出桶窗口，只有内置两种才走桶队列。
  const bounded = combine === sum || combine === bottleneck;
  return integral && bounded && max <= BUCKETS
    ? new BucketQueue(snapshot.order, max)
    : new LazyQueue(snapshot.order);
}

/**
 * Dijkstra：全程整数下标 + typed-array，优先队列不做 decrease-key——改善即入队，
 * 靠 `settled` 位图跳过过期条目。
 */
class Dijkstra extends Stepwise<Tree> {
  public readonly distance: Float64Array;
  public readonly parent: Int32Array;
  private readonly _closed: Uint8Array;
  private readonly _queue: IndexQueue;
  private _reached = 0;

  public constructor(
    private readonly _snapshot: Snapshot,
    source: NodeId,
    private readonly _target: number,
    private readonly _combine: Combine,
  ) {
    super();
    this.distance = new Float64Array(_snapshot.order).fill(Infinity);
    this.parent = new Int32Array(_snapshot.order).fill(-1);
    this._closed = new Uint8Array(_snapshot.order);
    this._queue = pick(_snapshot, _combine);

    const s = _snapshot.indexOf(source);
    if (s >= 0) {
      this.distance[s] = 0;
      this._queue.push(s, 0);
    }
  }

  public get progress(): number {
    return this._snapshot.order === 0
      ? 1
      : this._reached / this._snapshot.order;
  }

  protected step(): boolean {
    const u = this._queue.poll();
    if (u === -1) return false;
    if (this._closed[u] === 1) return true;
    this._closed[u] = 1;
    this._reached++;
    if (u === this._target) return false;

    const { offset, other, edge } = this._snapshot.outbound;
    const base = this.distance[u]!;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const v = other[k]!;
      if (this._closed[v] === 1) continue;
      const candidate = this._combine(base, this._snapshot.costAt(edge[k]!));
      if (candidate < this.distance[v]!) {
        this.distance[v] = candidate;
        this.parent[v] = u;
        this._queue.push(v, candidate);
      }
    }
    return true;
  }

  public result(): Tree {
    this.ensure();
    return { distance: this.distance, parent: this.parent };
  }
}

/**
 * 单源最短路径树，覆盖所有可达节点。
 *
 * @throws {@link Negative} 存在负权边——负权用 {@link bellmanFord}
 */
export const shortestPaths = (
  snapshot: Snapshot,
  source: NodeId,
  options: PathOptions = {},
): Task<Tree> => new Dijkstra(snapshot, source, -1, options.combine ?? sum);

/**
 * 单条最短路。摸到终点即停，因此**只**给出这一条路线——不返回路径树，
 * 避免把提前终止时尚未收敛的距离误当最短值使用。
 */
export const shortestPath = (
  snapshot: Snapshot,
  source: NodeId,
  target: NodeId,
  options: PathOptions = {},
): Task<Route | undefined> => {
  const t = snapshot.indexOf(target);
  return transform(
    new Dijkstra(snapshot, source, t, options.combine ?? sum),
    (tree) =>
      t < 0 || tree.distance[t] === Infinity
        ? undefined
        : { distance: tree.distance[t]!, path: trace(snapshot, tree, target) },
  );
};

/** 沿前驱链重建路径；目标不可达返回空数组。 */
export function trace(
  snapshot: Snapshot,
  tree: Tree,
  target: NodeId,
): NodeId[] {
  const t = snapshot.indexOf(target);
  if (t < 0 || tree.distance[t] === Infinity) return [];
  const path: NodeId[] = [];
  for (let cursor = t; cursor !== -1; cursor = tree.parent[cursor]!) {
    path.push(snapshot.label(cursor));
  }
  return path.reverse();
}

/** A\*：以 `g + h` 为优先级。`heuristic` 不高估真实剩余代价时结果最优。 */
class AStar extends Stepwise<Route | undefined> {
  private readonly _score: Float64Array;
  private readonly _parent: Int32Array;
  private readonly _closed: Uint8Array;
  private readonly _queue = new LazyQueue();
  private readonly _target: number;
  private _reached = 0;
  private _found = false;

  public constructor(
    private readonly _snapshot: Snapshot,
    source: NodeId,
    target: NodeId,
    private readonly _heuristic: (node: NodeId) => number,
    private readonly _combine: Combine,
  ) {
    super();
    this._score = new Float64Array(_snapshot.order).fill(Infinity);
    this._parent = new Int32Array(_snapshot.order).fill(-1);
    this._closed = new Uint8Array(_snapshot.order);
    this._target = _snapshot.indexOf(target);

    const s = _snapshot.indexOf(source);
    if (s >= 0 && this._target >= 0) {
      this._score[s] = 0;
      this._queue.push(s, _heuristic(source));
    }
  }

  public get progress(): number {
    return this._snapshot.order === 0
      ? 1
      : this._reached / this._snapshot.order;
  }

  protected step(): boolean {
    const u = this._queue.poll();
    if (u === -1) return false;
    // 终点首次出队即最优：f = g + h(target) 里 h 是常量。
    if (u === this._target) {
      this._found = true;
      return false;
    }
    if (this._closed[u] === 1) return true;
    this._closed[u] = 1;
    this._reached++;

    const { offset, other, edge } = this._snapshot.outbound;
    const base = this._score[u]!;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const v = other[k]!;
      if (this._closed[v] === 1) continue;
      const cost = this._snapshot.costAt(edge[k]!);
      if (cost < 0) throw new Negative(cost, this._snapshot.edges[edge[k]!]!);
      const candidate = this._combine(base, cost);
      if (candidate >= this._score[v]!) continue;
      this._score[v] = candidate;
      this._parent[v] = u;
      this._queue.push(v, candidate + this._heuristic(this._snapshot.label(v)));
    }
    return true;
  }

  public result(): Route | undefined {
    this.ensure();
    if (!this._found) return undefined;
    const path: NodeId[] = [];
    for (
      let cursor = this._target;
      cursor !== -1;
      cursor = this._parent[cursor]!
    ) {
      path.push(this._snapshot.label(cursor));
    }
    return { distance: this._score[this._target]!, path: path.reverse() };
  }
}

export const astar = (
  snapshot: Snapshot,
  source: NodeId,
  target: NodeId,
  heuristic: (node: NodeId) => number = () => 0,
  options: PathOptions = {},
): Task<Route | undefined> =>
  new AStar(snapshot, source, target, heuristic, options.combine ?? sum);

interface Side {
  readonly distance: Float64Array;
  readonly parent: Int32Array;
  readonly settled: Uint8Array;
  readonly queue: LazyQueue;
  /** 队列里可信的最小距离；惰性队列堆顶可能过期，故单独维护。 */
  frontier: number;
}

const flank = (order: number, source: number): Side => {
  const side: Side = {
    distance: new Float64Array(order).fill(Infinity),
    parent: new Int32Array(order).fill(-1),
    settled: new Uint8Array(order),
    queue: new LazyQueue(),
    frontier: 0,
  };
  if (source >= 0) {
    side.distance[source] = 0;
    side.queue.push(source, 0);
  }
  return side;
};

/**
 * 双向 Dijkstra：两侧交替扩展，`forward.frontier + backward.frontier >= best` 时停止。
 *
 * @remarks 终止条件要比较两侧前沿之和，而惰性队列的堆顶可能是过期条目。这里不引入
 *   decrease-key，而是把"已出队的最小距离"记在 {@link Side.frontier} 上——它单调
 *   非减且必然可信，同样能安全地作为终止判据。
 */
class Bidirectional extends Stepwise<Route | undefined> {
  private readonly _forward: Side;
  private readonly _backward: Side;
  private readonly _reverse: Snapshot;
  private readonly _source: number;
  private readonly _target: number;
  private _best = Infinity;
  private _meet = -1;
  private _reached = 0;

  public constructor(
    private readonly _snapshot: Snapshot,
    source: NodeId,
    target: NodeId,
  ) {
    super();
    this._source = _snapshot.indexOf(source);
    this._target = _snapshot.indexOf(target);
    this._reverse = _snapshot.reverse();
    this._forward = flank(_snapshot.order, this._source);
    this._backward = flank(_snapshot.order, this._target);
    if (this._source >= 0 && this._source === this._target) {
      this._best = 0;
      this._meet = this._source;
    }
  }

  public get progress(): number {
    return this._snapshot.order === 0
      ? 1
      : this._reached / (2 * this._snapshot.order);
  }

  protected step(): boolean {
    if (this._source < 0 || this._target < 0) return false;
    if (this._meet === this._source && this._best === 0) return false;
    if (this._forward.queue.empty() || this._backward.queue.empty())
      return false;
    if (this._forward.frontier + this._backward.frontier >= this._best)
      return false;

    const outward = this._forward.frontier <= this._backward.frontier;
    const near = outward ? this._forward : this._backward;
    const far = outward ? this._backward : this._forward;
    const view = outward ? this._snapshot : this._reverse;

    const u = near.queue.poll();
    if (u === -1) return false;
    if (near.settled[u] === 1) return true;
    near.settled[u] = 1;
    near.frontier = near.distance[u]!;
    this._reached++;
    this._link(u, near, far);

    const { offset, other, edge } = view.outbound;
    const base = near.distance[u]!;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const v = other[k]!;
      if (near.settled[v] === 1) continue;
      const cost = view.costAt(edge[k]!);
      if (cost < 0) throw new Negative(cost, view.edges[edge[k]!]!);
      const candidate = base + cost;
      if (candidate < near.distance[v]!) {
        near.distance[v] = candidate;
        near.parent[v] = u;
        near.queue.push(v, candidate);
        this._link(v, near, far);
      }
    }
    return true;
  }

  private _link(u: number, near: Side, far: Side): void {
    const total = near.distance[u]! + far.distance[u]!;
    if (total < this._best) {
      this._best = total;
      this._meet = u;
    }
  }

  public result(): Route | undefined {
    this.ensure();
    if (this._meet === -1 || this._best === Infinity) return undefined;
    const head: NodeId[] = [];
    for (
      let cursor = this._meet;
      cursor !== -1;
      cursor = this._forward.parent[cursor]!
    ) {
      head.push(this._snapshot.label(cursor));
    }
    head.reverse();
    for (
      let cursor = this._backward.parent[this._meet]!;
      cursor !== -1;
      cursor = this._backward.parent[cursor]!
    ) {
      head.push(this._snapshot.label(cursor));
    }
    return { distance: this._best, path: head };
  }
}

export const bidirectional = (
  snapshot: Snapshot,
  source: NodeId,
  target: NodeId,
): Task<Route | undefined> => new Bidirectional(snapshot, source, target);

/** Bellman-Ford：容许负权，每步推进一轮松弛。 */
class BellmanFord extends Stepwise<Tree> {
  private readonly _distance: Float64Array;
  private readonly _parent: Int32Array;
  private _round = 0;

  public constructor(
    private readonly _snapshot: Snapshot,
    source: NodeId,
  ) {
    super();
    this._distance = new Float64Array(_snapshot.order).fill(Infinity);
    this._parent = new Int32Array(_snapshot.order).fill(-1);
    const s = _snapshot.indexOf(source);
    if (s >= 0) this._distance[s] = 0;
  }

  public get progress(): number {
    return this._snapshot.order === 0 ? 1 : this._round / this._snapshot.order;
  }

  protected step(): boolean {
    if (this._round >= this._snapshot.order) return false;
    this._round++;
    const changed = this._relax();
    // 第 order 轮仍有改善 ⇒ 存在从起点可达的负环。
    if (changed && this._round === this._snapshot.order) {
      throw new Cycle(this._blame());
    }
    return changed;
  }

  private _relax(): boolean {
    const { order } = this._snapshot;
    const { offset, other, edge } = this._snapshot.outbound;
    let changed = false;
    for (let u = 0; u < order; u++) {
      const base = this._distance[u]!;
      if (base === Infinity) continue;
      for (let k = offset[u]!; k < offset[u + 1]!; k++) {
        const v = other[k]!;
        const candidate = base + this._snapshot.costAt(edge[k]!);
        if (candidate < this._distance[v]!) {
          this._distance[v] = candidate;
          this._parent[v] = u;
          changed = true;
        }
      }
    }
    return changed;
  }

  /** 沿前驱链走 order 步必然落在环上，再绕一圈即得环成员。 */
  private _blame(): NodeId[] {
    let cursor = 0;
    for (let u = 0; u < this._snapshot.order; u++) {
      if (this._parent[u] !== -1) cursor = u;
    }
    for (let i = 0; i < this._snapshot.order; i++) {
      const next = this._parent[cursor]!;
      if (next === -1) break;
      cursor = next;
    }
    const cycle: NodeId[] = [this._snapshot.label(cursor)];
    for (
      let walk = this._parent[cursor]!;
      walk !== -1 && walk !== cursor;
      walk = this._parent[walk]!
    ) {
      cycle.push(this._snapshot.label(walk));
    }
    return cycle.reverse();
  }

  public result(): Tree {
    this.ensure();
    return { distance: this._distance, parent: this._parent };
  }
}

/**
 * 单源最短路，容许负权。
 *
 * @throws {@link Cycle} 从起点可达负权环
 */
export const bellmanFord = (snapshot: Snapshot, source: NodeId): Task<Tree> =>
  new BellmanFord(snapshot, source);

/** 全源最短距离矩阵，行优先扁平存储。 */
export class Matrix {
  public constructor(
    public readonly order: number,
    public readonly cells: Float64Array,
    private readonly _snapshot: Snapshot,
  ) {}

  /** 不可达为 `Infinity`；未知节点为 `NaN`。 */
  public at(from: NodeId, to: NodeId): number {
    const u = this._snapshot.indexOf(from);
    const v = this._snapshot.indexOf(to);
    return u < 0 || v < 0 ? NaN : this.cells[u * this.order + v]!;
  }
}

/** Floyd-Warshall：每步推进一个中转节点。 */
class FloydWarshall extends Stepwise<Matrix> {
  private readonly _cells: Float64Array;
  private _through = 0;

  public constructor(private readonly _snapshot: Snapshot) {
    super();
    const n = _snapshot.order;
    this._cells = new Float64Array(n * n).fill(Infinity);
    for (let u = 0; u < n; u++) this._cells[u * n + u] = 0;

    const { offset, other, edge } = _snapshot.outbound;
    for (let u = 0; u < n; u++) {
      for (let k = offset[u]!; k < offset[u + 1]!; k++) {
        const cell = u * n + other[k]!;
        const cost = _snapshot.costAt(edge[k]!);
        if (cost < this._cells[cell]!) this._cells[cell] = cost;
      }
    }
  }

  public get progress(): number {
    return this._snapshot.order === 0
      ? 1
      : this._through / this._snapshot.order;
  }

  protected step(): boolean {
    const n = this._snapshot.order;
    if (this._through >= n) return false;
    const k = this._through++;
    const kRow = k * n;
    for (let u = 0; u < n; u++) {
      const uRow = u * n;
      const reach = this._cells[uRow + k]!;
      if (reach === Infinity) continue;
      for (let v = 0; v < n; v++) {
        const candidate = reach + this._cells[kRow + v]!;
        if (candidate < this._cells[uRow + v]!)
          this._cells[uRow + v] = candidate;
      }
    }
    if (this._through < n) return true;

    for (let u = 0; u < n; u++) {
      if (this._cells[u * n + u]! < 0) {
        throw new Cycle([this._snapshot.label(u)]);
      }
    }
    return false;
  }

  public result(): Matrix {
    this.ensure();
    return new Matrix(this._snapshot.order, this._cells, this._snapshot);
  }
}

/**
 * 全源最短路，容许负权。
 *
 * @throws {@link Cycle} 存在负权环
 */
export const floydWarshall = (snapshot: Snapshot): Task<Matrix> =>
  new FloydWarshall(snapshot);
