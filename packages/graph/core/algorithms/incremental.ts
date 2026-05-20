/**
 * IncrementalTopo：基于事件订阅的增量拓扑维护（Pearce-Kelly 局部重排）。
 *
 * @remarks
 * 节点新增 / 不破坏拓扑的边新增走 O(1) 快路径；违反拓扑但无环时走 Pearce-Kelly
 * O(|δ|) 局部重排；检测到环 / 节点未注册 / 已知含环时降级为 dirty，由下次查询触发
 * 完整 {@link topology} 重算。
 *
 * @see Pearce, D.J. & Kelly, P.H.J. (2007). "A Dynamic Topological Sort Algorithm
 *   for Directed Acyclic Graphs." ACM JEA 12.
 */

import type { NodeId, Subscribable, Walkable } from '../types';
import { topology } from './toposort';

/**
 * 增量拓扑维护器。订阅图变更事件，维护稀疏 rank 映射 + 环检测。
 *
 * @example
 * ```ts
 * const graph = new Graph(...);
 * const topo = new IncrementalTopo(graph);
 *
 * graph.addNode(A);                  // rank A = 0
 * graph.addNode(B);                  // rank B = 1
 * graph.connect(['A', 'y'], ['B', 'x']);  // OK, rank A < rank B
 *
 * console.log(topo.rank('A'));        // 0
 * console.log(topo.sorted());         // ['A', 'B']
 *
 * graph.connect(['B', 'y'], ['A', 'x']);  // 违反，dirty 标记
 * console.log(topo.hasCycle);         // true (查询触发重算)
 *
 * topo.dispose();                     // 取消所有订阅
 * ```
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export class IncrementalTopo<N = unknown, E = unknown> {
  /** NodeId → 当前 rank（稀疏，删除节点后留空隙）。 */
  private readonly _ranks = new Map<NodeId, number>();

  /**
   * 已分配的最大 rank。
   *
   * @remarks 节点 add 时 `++_maxRank` 单调递增、不复用被删节点留下的空隙；
   *   极长寿命会话 + 频繁 add/remove 时数字会很大，但仅作为 rank 比较用，
   *   不会溢出（Number 可安全表示 2^53 之内）；用户感知不到。
   */
  private _maxRank = -1;

  /** 是否需要在下次查询时重算。 */
  private _dirty = false;

  /** 重算缓存：是否含环。 */
  private _hasCycle = false;

  /** 重算缓存：环上节点（数组形式，外部返回时保留顺序）。 */
  private _cycleNodes: NodeId[] = [];

  /** 重算缓存：环上节点集合（用于 O(1) `has` 查询）。 */
  private _cycleSet = new Set<NodeId>();

  /** 重算缓存：上一次 `_recompute` 后 ranks 是否已是连续 0..N-1（无空隙）。 */
  private _dense = true;

  /** 持有的所有取消订阅函数。 */
  private readonly _unsubscribers: Array<() => void> = [];

  /**
   * @param _graph 既满足 {@link Walkable}（重算需要）又实现 {@link Subscribable}（订阅需要）的图
   */
  public constructor(
    private readonly _graph: Walkable & Subscribable<N, E>,
  ) {
    this._recompute();
    this._unsubscribers.push(
      _graph.signal.on('nodeAdded', ({ node }) => this._addNode(node.id)),
      _graph.signal.on('nodeRemoved', ({ node }) => this._removeNode(node.id)),
      _graph.signal.on('edgeAdded', ({ edge }) => this._addEdge(edge.sourceId, edge.targetId)),
      _graph.signal.on('edgeRemoved', () => this._removeEdge()),
    );
  }

  /**
   * 节点的拓扑序位置（0-based）；不存在时返回 `undefined`。
   *
   * @remarks 含环时环上节点的 rank 与重算时机有关，调用方应先检查 {@link hasCycle}。
   *
   * @param id 节点 ID
   * @returns rank；节点不存在时 `undefined`
   */
  public rank(id: NodeId): number | undefined {
    if (this._dirty) this._recompute();
    return this._ranks.get(id);
  }

  /**
   * 比较两个节点的拓扑顺序。
   *
   * @param a 节点 A
   * @param b 节点 B
   * @returns 负数表示 `a` 在前，正数表示 `b` 在前，0 表示相等或都不存在
   */
  public compare(a: NodeId, b: NodeId): number {
    if (this._dirty) this._recompute();
    const ra = this._ranks.get(a);
    const rb = this._ranks.get(b);
    if (ra === undefined || rb === undefined) return 0;
    return ra - rb;
  }

  /**
   * 当前全部节点的拓扑顺序快照。
   *
   * @remarks
   * 稀疏 rank（含 gaps）会被压紧成 0..N-1 的连续序列。返回数组与 rank 映射独立，
   * 调用方修改返回值不影响内部状态。
   *
   * 性能：刚 `_recompute` 后内部是稠密的，按下标直接填入 O(N)；
   * 节点 add/remove 后变稀疏，再回退到 entries + sort 路径 O(N log N)。
   *
   * @returns 拓扑顺序的节点 ID 数组
   */
  public sorted(): NodeId[] {
    if (this._dirty) this._recompute();
    if (this._dense) {
      const result: NodeId[] = new Array(this._ranks.size);
      for (const [id, rank] of this._ranks) result[rank] = id;
      return result;
    }
    const entries = Array.from(this._ranks.entries());
    entries.sort((a, b) => a[1] - b[1]);
    return entries.map(([id]) => id);
  }

  /** 当前图是否含环（懒求值，可能触发重算）。 */
  public get hasCycle(): boolean {
    if (this._dirty) this._recompute();
    return this._hasCycle;
  }

  /** 当前环上节点列表（懒求值）。 */
  public get cycleNodes(): readonly NodeId[] {
    if (this._dirty) this._recompute();
    return this._cycleNodes;
  }

  /**
   * 强制立即重算（调试 / 测试用）。常规调用方应当依赖懒求值。
   */
  public sync(): void {
    this._recompute();
  }

  /**
   * 取消所有事件订阅，释放对图的引用。释放后行为未定义。
   */
  public dispose(): void {
    for (const off of this._unsubscribers) off();
    this._unsubscribers.length = 0;
  }

  /**
   * 完整重算 ranks + 环路信息。O(V+E)。
   *
   * @internal
   */
  private _recompute(): void {
    const result = topology(this._graph);
    this._ranks.clear();
    for (let i = 0; i < result.order.length; i++) {
      this._ranks.set(result.order[i]!, i);
    }
    this._maxRank = result.order.length - 1;
    this._hasCycle = result.cycles.hasCycle;
    this._cycleNodes = result.cycles.cycleNodes;
    this._cycleSet = new Set(this._cycleNodes);
    this._dense = true;
    this._dirty = false;
  }

  /**
   * 节点入图回调：在 rank 表末尾分配新 rank（O(1)）。
   *
   * @internal
   */
  private _addNode(nodeId: NodeId): void {
    if (this._ranks.has(nodeId)) return;
    this._ranks.set(nodeId, ++this._maxRank);
    // 新 rank 恰好等于旧 size 时仍稠密；旧 size < _maxRank（有删除空隙）时退化为稀疏。
    if (this._maxRank !== this._ranks.size - 1) this._dense = false;
  }

  /**
   * 节点离图回调：从 ranks 中删除；不压紧（留空隙换 O(1)）。
   *
   * @remarks 删除的若是末位 rank（且 `_dense=true` 即未提前破坏），降下 `_maxRank` 仍可
   *   保持稠密；只有删中间位置才真正变稀疏。
   *
   * @internal
   */
  private _removeNode(nodeId: NodeId): void {
    const rank = this._ranks.get(nodeId);
    if (rank === undefined) return;
    this._ranks.delete(nodeId);
    if (rank === this._maxRank && this._dense) {
      // 删的是末位且之前稠密 — 可压紧 _maxRank 而保持稠密
      this._maxRank--;
    } else {
      this._dense = false;
    }
    // 若被删节点曾在环上，环路信息也过期了（O(1) 查询）
    if (this._cycleSet.has(nodeId)) this._dirty = true;
  }

  /**
   * 边入图回调：Pearce-Kelly 局部重排；环 / 退化情形降级为 dirty。
   *
   * @internal
   */
  private _addEdge(sourceId: NodeId, targetId: NodeId): void {
    if (sourceId === targetId || this._hasCycle) {
      this._dirty = true;
      return;
    }
    const ru = this._ranks.get(sourceId);
    const rv = this._ranks.get(targetId);
    if (ru === undefined || rv === undefined) {
      this._dirty = true;
      return;
    }
    if (ru < rv) return;

    const lb = rv;
    const ub = ru;
    const graph = this._graph;
    const ranks = this._ranks;

    const fwd = this._collect(targetId, (n) => graph.downstream(n), (r) => r <= ub, sourceId);
    if (fwd === null) {
      this._dirty = true;
      return;
    }
    const bwd = this._collect(sourceId, (n) => graph.upstream(n), (r) => r >= lb);

    const byRank = (a: NodeId, b: NodeId): number => ranks.get(a)! - ranks.get(b)!;
    bwd.sort(byRank);
    fwd.sort(byRank);

    // bwd ∪ fwd 原本占用的槽位（无重叠：若相交即环，已在前向遍历拦截）。
    const slots: number[] = new Array(bwd.length + fwd.length);
    let i = 0;
    for (const n of bwd) slots[i++] = ranks.get(n)!;
    for (const n of fwd) slots[i++] = ranks.get(n)!;
    slots.sort((a, b) => a - b);

    // bwd 占小槽位、fwd 占大槽位——u 必排到 v 之前，新边的拓扑约束自动满足。
    i = 0;
    for (const n of bwd) ranks.set(n, slots[i++]!);
    for (const n of fwd) ranks.set(n, slots[i++]!);
  }

  /**
   * PK 受影响区域 DFS：从 `start` 出发按 `expand` 邻接遍历，仅收集 rank 满足 `accept`
   * 的节点。途中若遇到 `abort`，返回 `null` 标识环。
   *
   * @internal
   */
  private _collect(
    start: NodeId,
    expand: (n: NodeId) => Iterable<NodeId>,
    accept: (r: number) => boolean,
  ): NodeId[];
  private _collect(
    start: NodeId,
    expand: (n: NodeId) => Iterable<NodeId>,
    accept: (r: number) => boolean,
    abort: NodeId,
  ): NodeId[] | null;
  private _collect(
    start: NodeId,
    expand: (n: NodeId) => Iterable<NodeId>,
    accept: (r: number) => boolean,
    abort?: NodeId,
  ): NodeId[] | null {
    const visited = new Set<NodeId>([start]);
    const region: NodeId[] = [start];
    const stack: NodeId[] = [start];
    while (stack.length > 0) {
      const node = stack.pop()!;
      for (const adj of expand(node)) {
        if (visited.has(adj)) continue;
        if (adj === abort) return null;
        const rank = this._ranks.get(adj);
        if (rank === undefined || !accept(rank)) continue;
        visited.add(adj);
        region.push(adj);
        stack.push(adj);
      }
    }
    return region;
  }

  /**
   * 边离图回调：只可能让拓扑更"宽松"；若之前存在环，删除一条边可能解开它 → dirty。
   *
   * @internal
   */
  private _removeEdge(): void {
    if (this._hasCycle) this._dirty = true;
  }
}
