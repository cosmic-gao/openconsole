/**
 * IncrementalTopo：基于事件订阅的增量拓扑维护。
 *
 * @remarks
 * 订阅图的 add/remove 事件并维护 ranks 映射。设计策略：
 * - **happy path**：节点添加在末尾分配新 rank（O(1)）；不破坏拓扑的边变更不触发重排（O(1)）。
 * - **violation path**：当一条新边导致 `rank(source) >= rank(target)` 时，标记 dirty，下次
 *   `rank()` / `sorted()` / `hasCycle` 查询时触发完整 {@link topology} 重算（O(V+E)）。
 *
 * 这种"懒重排"策略对节点编辑器 / 可视化编程场景最实用：用户多数情况下按拓扑顺序连线，
 * 维护成本接近 O(1)；偶尔的违规也只承担一次延后的全量重算。
 *
 * 更激进的优化（如 Pearce-Kelly 的真 O(|delta|) 局部重排）可以作为 v2 在不改 API 的前提下替换。
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

  /** 已分配的最大 rank。 */
  private _maxRank = -1;

  /** 是否需要在下次查询时重算。 */
  private _dirty = false;

  /** 重算缓存：是否含环。 */
  private _hasCycle = false;

  /** 重算缓存：环上节点。 */
  private _cycleNodes: NodeId[] = [];

  /** 持有的所有取消订阅函数。 */
  private readonly _unsubscribers: Array<() => void> = [];

  /**
   * @param _graph 既满足 Walkable（重算需要）又实现 Subscribable（订阅需要）的图
   */
  public constructor(
    private readonly _graph: Walkable & Subscribable<N, E>,
  ) {
    this._recompute();
    this._unsubscribers.push(
      _graph.on('nodeAdded', ({ node }) => this._onNodeAdded(node.id)),
      _graph.on('nodeRemoved', ({ node }) => this._onNodeRemoved(node.id)),
      _graph.on('edgeAdded', ({ edge }) => this._onEdgeAdded(edge.sourceId, edge.targetId)),
      _graph.on('edgeRemoved', () => this._onEdgeRemoved()),
    );
  }

  /**
   * 节点的拓扑序位置（0-based）；不存在时返回 `undefined`。
   *
   * @remarks 含环时环上节点的 rank 与重算时机有关，调用方应先检查 {@link hasCycle}。
   */
  public rank(id: NodeId): number | undefined {
    if (this._dirty) this._recompute();
    return this._ranks.get(id);
  }

  /**
   * 比较两个节点的拓扑顺序：负数表示 `a` 在前，正数表示 `b` 在前，0 表示相等或都不存在。
   *
   * @param a 节点 A
   * @param b 节点 B
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
   */
  public sorted(): NodeId[] {
    if (this._dirty) this._recompute();
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
    this._dirty = false;
  }

  /**
   * 节点入图：追加到 rank 序列末尾（O(1)）。
   *
   * @internal
   */
  private _onNodeAdded(nodeId: NodeId): void {
    if (this._ranks.has(nodeId)) return;
    this._ranks.set(nodeId, ++this._maxRank);
  }

  /**
   * 节点离图：从 ranks 中删除；不压紧（留空隙换 O(1)）。
   *
   * @internal
   */
  private _onNodeRemoved(nodeId: NodeId): void {
    this._ranks.delete(nodeId);
    // 若被删节点曾在环上，环路信息也过期了
    if (this._cycleNodes.length > 0 && this._cycleNodes.includes(nodeId)) {
      this._dirty = true;
    }
  }

  /**
   * 边入图：rank(source) < rank(target) 时无操作；否则标记 dirty。
   *
   * @internal
   */
  private _onEdgeAdded(sourceId: NodeId, targetId: NodeId): void {
    const rs = this._ranks.get(sourceId);
    const rt = this._ranks.get(targetId);
    if (rs === undefined || rt === undefined) {
      // 罕见情况：边端节点尚未进入 rank（事件乱序），保险起见 dirty
      this._dirty = true;
      return;
    }
    if (rs >= rt) {
      // 违反：要么实际上是环，要么需要局部重排；统一交给下次重算
      this._dirty = true;
    }
  }

  /**
   * 边离图：只可能让拓扑更"宽松"；若之前存在环，删除一条边可能解开它 → dirty。
   *
   * @internal
   */
  private _onEdgeRemoved(): void {
    if (this._hasCycle) this._dirty = true;
  }
}
