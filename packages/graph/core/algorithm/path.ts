import { BucketQueue, LazyQueue, type IndexQueue } from "@openconsole/queue";

import { Cycle, Invalid, Negative } from "../error";
import { reversed, type Reals, type Structure } from "../snapshot";
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
  /** 路径上的节点索引，从起点到终点。 */
  readonly path: Int32Array;
}

export interface PathOptions {
  combine?: Combine;
}

/** 桶队列上限：超过它桶数组与空桶扫描都不再划算。 */
const BUCKETS = 1 << 16;

/** 边权画像：是否全为非负整数，以及最大值。 */
interface Profile {
  readonly integral: boolean;
  readonly max: number;
}

/**
 * 边权画像的记忆表。
 *
 * @remarks 画像是**不可变结构**的属性，只该算一次：不缓存的话，在 V=5000 / E=40000 上
 *   这一遍扫描要占单次 Dijkstra 的 17%，多源场景更是白付一个 O(V·E)。记在 `WeakMap` 上
 *   而不是 `Snapshot` 字段上，是为了让自定义 {@link Structure} 实现同样享受到。
 *
 *   键取**权重数组**而不是结构：`reversed()` / {@link Snapshot.reverse} 每次都产出新的
 *   结构对象却共享同一份权重，以结构为键的话反向搜索每跑一次就要重扫一遍全部边权。
 *
 *   前提是权重数组不被就地改写——`Reals` 在类型上只读，{@link Snapshot} 也从不复用它：
 *   增量重编译产出的是新数组、新实例，因此不会读到过期画像。
 */
const profiles = new WeakMap<Reals | Structure, Profile>();

/**
 * @throws {@link Negative} 存在负权边
 * @throws {@link Invalid} 存在 `NaN` 权边
 */
function profileOf(structure: Structure): Profile {
  const weight = structure.weight;
  // 无权结构没有可共享的数组，退回以结构本身为键。
  const key = weight ?? structure;
  const known = profiles.get(key);
  if (known) return known;

  let found: Profile;
  if (weight === undefined) {
    found = { integral: true, max: 1 };
  } else {
    let integral = true;
    let max = 0;
    for (let e = 0; e < weight.length; e++) {
      const cost = weight[e]!;
      // 这一遍本来就要走完，顺手拦下 NaN 是零成本；放过去就是一个查不出的"不可达"。
      if (Number.isNaN(cost)) throw new Invalid(e);
      if (cost < 0) throw new Negative(cost, e);
      if (integral && !Number.isInteger(cost)) integral = false;
      if (cost > max) max = cost;
    }
    found = { integral, max };
  }
  profiles.set(key, found);
  return found;
}

/**
 * 挑选优先队列，顺手校验负权。非负整数权且内置 combine 保证增量有界时用桶队列
 * （O(1) 出入队），否则用惰性堆。两者给出的距离一致，只影响耗时。
 */
function pick(structure: Structure, combine: Combine): IndexQueue {
  const { integral, max } = profileOf(structure);
  // 自定义 combine 可能把优先级推出桶窗口，只有内置两种才走桶队列。
  const bounded = combine === sum || combine === bottleneck;
  return integral && bounded && max <= BUCKETS
    ? new BucketQueue(structure.order, max)
    : new LazyQueue(structure.order);
}

/**
 * Dijkstra：全程整数下标 + typed-array，优先队列不做 decrease-key——改善即入队，
 * 靠 `closed` 位图跳过过期条目。
 */
class Dijkstra extends Stepwise<Tree> {
  public readonly distance: Float64Array;
  public readonly parent: Int32Array;
  private readonly _closed: Uint8Array;
  private readonly _queue: IndexQueue;
  private readonly _weight: Reals | undefined;
  /** 默认语义是加法；据此特化内层循环，省掉每条边一次的间接调用。 */
  private readonly _adding: boolean;
  private _reached = 0;

  public constructor(
    private readonly _structure: Structure,
    source: number,
    private readonly _target: number,
    private readonly _combine: Combine,
  ) {
    super();
    this.distance = new Float64Array(_structure.order).fill(Infinity);
    this.parent = new Int32Array(_structure.order).fill(-1);
    this._closed = new Uint8Array(_structure.order);
    this._queue = pick(_structure, _combine);
    this._weight = _structure.weight;
    this._adding = _combine === sum;

    if (source >= 0 && source < _structure.order) {
      this.distance[source] = 0;
      this._queue.push(source, 0);
    }
  }

  protected measure(): number {
    return this._structure.order === 0
      ? 1
      : this._reached / this._structure.order;
  }

  protected step(): boolean {
    const u = this._queue.poll();
    if (u === -1) return false;
    if (this._closed[u] === 1) return true;
    this._closed[u] = 1;
    this._reached++;
    if (u === this._target) return false;

    const { offset, other, edge } = this._structure.outbound;
    const weight = this._weight;
    const base = this.distance[u]!;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const v = other[k]!;
      if (this._closed[v] === 1) continue;
      const cost = weight === undefined ? 1 : weight[edge[k]!]!;
      const candidate = this._adding ? base + cost : this._combine(base, cost);
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
  structure: Structure,
  source: number,
  options: PathOptions = {},
): Task<Tree> => new Dijkstra(structure, source, -1, options.combine ?? sum);

/**
 * 单条最短路。摸到终点即停，因此**只**给出这一条路线——不返回路径树，
 * 避免把提前终止时尚未收敛的距离误当最短值使用。
 */
export const shortestPath = (
  structure: Structure,
  source: number,
  target: number,
  options: PathOptions = {},
): Task<Route | undefined> =>
  transform(
    new Dijkstra(structure, source, target, options.combine ?? sum),
    (tree) =>
      target < 0 ||
      target >= structure.order ||
      tree.distance[target] === Infinity
        ? undefined
        : { distance: tree.distance[target]!, path: trace(tree, target) },
  );

/** 沿前驱链重建路径；目标越界或不可达返回空数组。 */
export function trace(tree: Tree, target: number): Int32Array {
  // 越界必须在这里挡住：`parent[越界]` 是 undefined，往下走会变成不终止的回溯。
  if (target < 0 || target >= tree.parent.length) return new Int32Array(0);
  if (tree.distance[target] === Infinity) return new Int32Array(0);
  let depth = 0;
  for (let cursor = target; cursor !== -1; cursor = tree.parent[cursor]!) {
    depth++;
  }
  const path = new Int32Array(depth);
  for (let cursor = target; cursor !== -1; cursor = tree.parent[cursor]!) {
    path[--depth] = cursor;
  }
  return path;
}

/** A\*：以 `g + h` 为优先级。`heuristic` 不高估真实剩余代价时结果最优。 */
class AStar extends Stepwise<Route | undefined> {
  private readonly _score: Float64Array;
  private readonly _parent: Int32Array;
  private readonly _closed: Uint8Array;
  private readonly _queue = new LazyQueue();
  private readonly _weight: Reals | undefined;
  private readonly _adding: boolean;
  private _reached = 0;
  private _found = false;

  public constructor(
    private readonly _structure: Structure,
    source: number,
    private readonly _target: number,
    private readonly _heuristic: (node: number) => number,
    private readonly _combine: Combine,
  ) {
    super();
    this._score = new Float64Array(_structure.order).fill(Infinity);
    this._parent = new Int32Array(_structure.order).fill(-1);
    this._closed = new Uint8Array(_structure.order);
    this._weight = _structure.weight;
    this._adding = _combine === sum;

    const inside = (u: number): boolean => u >= 0 && u < _structure.order;
    if (inside(source) && inside(_target)) {
      this._score[source] = 0;
      this._queue.push(source, _heuristic(source));
    }
  }

  protected measure(): number {
    return this._structure.order === 0
      ? 1
      : this._reached / this._structure.order;
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

    const { offset, other, edge } = this._structure.outbound;
    const weight = this._weight;
    const base = this._score[u]!;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const v = other[k]!;
      if (this._closed[v] === 1) continue;
      const e = edge[k]!;
      const cost = weight === undefined ? 1 : weight[e]!;
      if (cost < 0) throw new Negative(cost, e);
      const candidate = this._adding ? base + cost : this._combine(base, cost);
      if (candidate >= this._score[v]!) continue;
      this._score[v] = candidate;
      this._parent[v] = u;
      this._queue.push(v, candidate + this._heuristic(v));
    }
    return true;
  }

  public result(): Route | undefined {
    this.ensure();
    if (!this._found) return undefined;
    const tree: Tree = { distance: this._score, parent: this._parent };
    return {
      distance: this._score[this._target]!,
      path: trace(tree, this._target),
    };
  }
}

export const astar = (
  structure: Structure,
  source: number,
  target: number,
  heuristic: (node: number) => number = () => 0,
  options: PathOptions = {},
): Task<Route | undefined> =>
  new AStar(structure, source, target, heuristic, options.combine ?? sum);

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
  if (source >= 0 && source < order) {
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
  private readonly _reverse: Structure;
  private readonly _weight: Reals | undefined;
  private _best = Infinity;
  private _meet = -1;
  private _reached = 0;

  public constructor(
    private readonly _structure: Structure,
    private readonly _source: number,
    private readonly _target: number,
  ) {
    super();
    this._reverse = reversed(_structure);
    this._weight = _structure.weight;
    this._forward = flank(_structure.order, _source);
    this._backward = flank(_structure.order, _target);
    if (_source >= 0 && _source < _structure.order && _source === _target) {
      this._best = 0;
      this._meet = _source;
    }
  }

  protected measure(): number {
    return this._structure.order === 0
      ? 1
      : this._reached / (2 * this._structure.order);
  }

  protected step(): boolean {
    const order = this._structure.order;
    if (this._source < 0 || this._target < 0) return false;
    if (this._source >= order || this._target >= order) return false;
    if (this._meet === this._source && this._best === 0) return false;
    if (this._forward.queue.empty() || this._backward.queue.empty())
      return false;
    if (this._forward.frontier + this._backward.frontier >= this._best)
      return false;

    const outward = this._forward.frontier <= this._backward.frontier;
    const near = outward ? this._forward : this._backward;
    const far = outward ? this._backward : this._forward;
    const view = outward ? this._structure : this._reverse;

    const u = near.queue.poll();
    if (u === -1) return false;
    if (near.settled[u] === 1) return true;
    near.settled[u] = 1;
    near.frontier = near.distance[u]!;
    this._reached++;
    this._link(u, near, far);

    const { offset, other, edge } = view.outbound;
    const weight = this._weight;
    const base = near.distance[u]!;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const v = other[k]!;
      if (near.settled[v] === 1) continue;
      const e = edge[k]!;
      const cost = weight === undefined ? 1 : weight[e]!;
      if (cost < 0) throw new Negative(cost, e);
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
    let ahead = 0;
    for (
      let cursor = this._meet;
      cursor !== -1;
      cursor = this._forward.parent[cursor]!
    ) {
      ahead++;
    }
    let behind = 0;
    for (
      let cursor = this._backward.parent[this._meet]!;
      cursor !== -1;
      cursor = this._backward.parent[cursor]!
    ) {
      behind++;
    }

    const path = new Int32Array(ahead + behind);
    let at = ahead;
    for (
      let cursor = this._meet;
      cursor !== -1;
      cursor = this._forward.parent[cursor]!
    ) {
      path[--at] = cursor;
    }
    at = ahead;
    for (
      let cursor = this._backward.parent[this._meet]!;
      cursor !== -1;
      cursor = this._backward.parent[cursor]!
    ) {
      path[at++] = cursor;
    }
    return { distance: this._best, path };
  }
}

export const bidirectional = (
  structure: Structure,
  source: number,
  target: number,
): Task<Route | undefined> => new Bidirectional(structure, source, target);

/** Bellman-Ford：容许负权，每步松弛一个节点的出边。 */
class BellmanFord extends Stepwise<Tree> {
  private readonly _distance: Float64Array;
  private readonly _parent: Int32Array;
  private readonly _weight: Reals | undefined;
  private _round = 0;
  private _cursor = 0;
  /** 本轮是否有过改善；一整轮无改善即收敛。 */
  private _changed = false;

  public constructor(
    private readonly _structure: Structure,
    source: number,
  ) {
    super();
    this._distance = new Float64Array(_structure.order).fill(Infinity);
    this._parent = new Int32Array(_structure.order).fill(-1);
    this._weight = _structure.weight;
    if (source >= 0 && source < _structure.order) this._distance[source] = 0;
  }

  protected measure(): number {
    const n = this._structure.order;
    return n === 0 ? 1 : (this._round * n + this._cursor) / (n * n);
  }

  /**
   * 一步 = 一轮松弛里的一个节点，O(deg)。
   *
   * @remarks 一整轮是 O(E)；在稠密图上那已经比其他算法的单步粗一个数量级，分帧时会
   *   卡出可见的掉帧。轮次边界单独占一步，收敛判定与负环判定都落在那里。
   */
  protected step(): boolean {
    const n = this._structure.order;
    if (this._round >= n) return false;

    if (this._cursor >= n) {
      this._round++;
      this._cursor = 0;
      const changed = this._changed;
      this._changed = false;
      // 第 order 轮仍有改善 ⇒ 存在从起点可达的负环。
      if (changed && this._round === n) throw new Cycle(this._blame());
      return changed;
    }

    const u = this._cursor++;
    const base = this._distance[u]!;
    if (base === Infinity) return true;

    const { offset, other, edge } = this._structure.outbound;
    const weight = this._weight;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const v = other[k]!;
      const candidate = base + (weight === undefined ? 1 : weight[edge[k]!]!);
      if (candidate < this._distance[v]!) {
        this._distance[v] = candidate;
        this._parent[v] = u;
        this._changed = true;
      }
    }
    return true;
  }

  /** 沿前驱链走 order 步必然落在环上，再绕一圈即得环成员。 */
  private _blame(): number[] {
    let cursor = 0;
    for (let u = 0; u < this._structure.order; u++) {
      if (this._parent[u] !== -1) cursor = u;
    }
    for (let i = 0; i < this._structure.order; i++) {
      const next = this._parent[cursor]!;
      if (next === -1) break;
      cursor = next;
    }
    const cycle: number[] = [cursor];
    for (
      let walk = this._parent[cursor]!;
      walk !== -1 && walk !== cursor;
      walk = this._parent[walk]!
    ) {
      cycle.push(walk);
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
export const bellmanFord = (structure: Structure, source: number): Task<Tree> =>
  new BellmanFord(structure, source);

/** 全源最短距离矩阵，行优先扁平存储。 */
export class Matrix {
  public constructor(
    public readonly order: number,
    public readonly cells: Float64Array,
  ) {}

  /** 不可达为 `Infinity`；越界为 `NaN`。 */
  public at(from: number, to: number): number {
    if (from < 0 || to < 0 || from >= this.order || to >= this.order) {
      return NaN;
    }
    return this.cells[from * this.order + to]!;
  }
}

/** Floyd-Warshall：每步推进一个中转节点的一行。 */
class FloydWarshall extends Stepwise<Matrix> {
  private readonly _cells: Float64Array;
  private _through = 0;
  private _row = 0;

  public constructor(private readonly _structure: Structure) {
    super();
    const n = _structure.order;
    this._cells = new Float64Array(n * n).fill(Infinity);
    for (let u = 0; u < n; u++) this._cells[u * n + u] = 0;

    const { offset, other, edge } = _structure.outbound;
    const weight = _structure.weight;
    for (let u = 0; u < n; u++) {
      for (let k = offset[u]!; k < offset[u + 1]!; k++) {
        const cell = u * n + other[k]!;
        const cost = weight === undefined ? 1 : weight[edge[k]!]!;
        if (cost < this._cells[cell]!) this._cells[cell] = cost;
      }
    }
  }

  protected measure(): number {
    const n = this._structure.order;
    return n === 0 ? 1 : (this._through * n + this._row) / (n * n);
  }

  /**
   * 一步 = 一个中转节点的一行，O(V)。
   *
   * @remarks 整个矩阵是 O(V³)，一步吃掉一个完整的中转节点就是 O(V²)——V=5000 时单步
   *   要几十毫秒，`schedule` 的一帧预算再小也让不出去。粒度必须细到与其他算法可比。
   */
  protected step(): boolean {
    const n = this._structure.order;
    if (this._through >= n) return false;

    const k = this._through;
    const uRow = this._row * n;
    const reach = this._cells[uRow + k]!;
    if (reach !== Infinity) {
      const kRow = k * n;
      for (let v = 0; v < n; v++) {
        const candidate = reach + this._cells[kRow + v]!;
        if (candidate < this._cells[uRow + v]!) {
          this._cells[uRow + v] = candidate;
        }
      }
    }

    this._row++;
    if (this._row < n) return true;
    this._row = 0;
    this._through++;
    if (this._through < n) return true;

    for (let u = 0; u < n; u++) {
      if (this._cells[u * n + u]! < 0) throw new Cycle([u]);
    }
    return false;
  }

  public result(): Matrix {
    this.ensure();
    return new Matrix(this._structure.order, this._cells);
  }
}

/**
 * 全源最短路，容许负权。
 *
 * @throws {@link Cycle} 存在负权环
 */
export const floydWarshall = (structure: Structure): Task<Matrix> =>
  new FloydWarshall(structure);
