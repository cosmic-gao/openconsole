import type { Graph } from "../graph";
import type { EdgeId, NodeId } from "../ident";
import { Snapshot } from "../snapshot";
import { settle } from "../task";
import { scc } from "./component";
import { topology } from "./order";

/**
 * 增量维护的拓扑序（Pearce-Kelly）：订阅图事件就地重排，不整图重算。
 *
 * 造成环的边不触发重算，而是记入 {@link Ordering.conflicts} 并从拓扑约束中排除——
 * 剩下的子图始终是 DAG，顺序始终有效。因此"图里长期带环"这种编辑器常态不会把
 * 每次变更都退化成 O(V+E)。
 */
export class Ordering<N = unknown, E = unknown> {
  private readonly _rank = new Map<NodeId, number>();
  private readonly _conflicts = new Set<EdgeId>();
  private readonly _unsubscribe: Array<() => void> = [];
  private _next = 0;

  public constructor(private readonly _graph: Graph<N, E>) {
    this._reset();
    const signal = _graph.signal;
    this._unsubscribe.push(
      signal.on("nodeAdded", ({ node }) => {
        if (!this._rank.has(node)) this._rank.set(node, this._next++);
      }),
      signal.on("nodeDropped", ({ node }) => {
        this._rank.delete(node);
      }),
      signal.on("edgeAdded", ({ edge, source, target }) => {
        this._insert(edge, source, target);
      }),
      signal.on("edgeDropped", ({ edge }) => {
        // 删边不可能破坏既有顺序，只需撤销它的冲突登记。
        this._conflicts.delete(edge);
      }),
    );
  }

  /** 节点不存在返回 `undefined`。 */
  public rank(node: NodeId): number | undefined {
    return this._rank.get(node);
  }

  /** 可直接用作 `sort` 比较器；任一节点缺失时视为相等。 */
  public compare(a: NodeId, b: NodeId): number {
    const left = this._rank.get(a);
    const right = this._rank.get(b);
    return left === undefined || right === undefined ? 0 : left - right;
  }

  public sorted(): NodeId[] {
    return [...this._rank.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([node]) => node);
  }

  /** 是否存在被排除的成环边。O(1)。 */
  public get cyclic(): boolean {
    return this._conflicts.size > 0;
  }

  /** 因成环而被排除在拓扑约束之外的边。 */
  public get conflicts(): ReadonlySet<EdgeId> {
    return this._conflicts;
  }

  /** 参与环的节点，按分量分组。按需计算，O(V+E)。 */
  public cycles(): NodeId[][] {
    if (this._conflicts.size === 0) return [];
    const snapshot = Snapshot.of(this._graph);
    return settle(scc(snapshot))
      .groups()
      .filter(
        (members) =>
          members.length > 1 || this._graph.adjacent(members[0]!, members[0]!),
      );
  }

  /** 丢弃增量状态并整图重算。 */
  public refresh(): void {
    this._reset();
  }

  public dispose(): void {
    for (const off of this._unsubscribe) off();
    this._unsubscribe.length = 0;
  }

  private _reset(): void {
    const snapshot = Snapshot.of(this._graph);
    const result = settle(topology(snapshot));
    this._rank.clear();
    this._conflicts.clear();
    this._next = 0;
    for (const node of result.order) this._rank.set(node, this._next++);
    for (const node of result.cycle) this._rank.set(node, this._next++);

    // 环节点的相对顺序是任意的，把逆序的那些边挑出来排除，剩下的仍是合法拓扑序。
    for (const node of result.cycle) {
      const from = this._rank.get(node)!;
      this._graph.forEachOut(node, (target, edge) => {
        const to = this._rank.get(target);
        if (to !== undefined && from >= to) this._conflicts.add(edge);
      });
    }
  }

  private _insert(edge: EdgeId, source: NodeId, target: NodeId): void {
    const from = this._rank.get(source);
    const to = this._rank.get(target);
    if (from === undefined || to === undefined) return;
    if (from < to) return;

    const ahead = this._region(target, from, true, source);
    if (ahead === null) {
      this._conflicts.add(edge);
      return;
    }
    const behind = this._region(source, to, false);

    const byRank = (a: NodeId, b: NodeId): number =>
      this._rank.get(a)! - this._rank.get(b)!;
    behind.sort(byRank);
    ahead.sort(byRank);

    // 收回两个区域占用的所有位次，按"祖先区在前"重新发放。
    const positions = [...behind, ...ahead]
      .map((node) => this._rank.get(node)!)
      .sort((a, b) => a - b);
    let cursor = 0;
    for (const node of behind) this._rank.set(node, positions[cursor++]!);
    for (const node of ahead) this._rank.set(node, positions[cursor++]!);
  }

  private _region(start: NodeId, bound: number, outward: boolean): NodeId[];
  private _region(
    start: NodeId,
    bound: number,
    outward: boolean,
    stop: NodeId,
  ): NodeId[] | null;
  /**
   * 收集受影响的区域：`outward` 为真时沿出边找 rank 不超过 `bound` 的后代，
   * 否则沿入边找 rank 不低于 `bound` 的祖先。碰到 `stop` 说明成环，返回 `null`。
   */
  private _region(
    start: NodeId,
    bound: number,
    outward: boolean,
    stop?: NodeId,
  ): NodeId[] | null {
    const seen = new Set<NodeId>([start]);
    const region: NodeId[] = [start];
    const stack: NodeId[] = [start];

    while (stack.length > 0) {
      const node = stack.pop()!;
      let cyclic = false;
      const expand = (other: NodeId, edge: EdgeId): boolean | void => {
        if (this._conflicts.has(edge)) return;
        if (other === stop) {
          cyclic = true;
          return false;
        }
        if (seen.has(other)) return;
        const rank = this._rank.get(other);
        if (rank === undefined) return;
        if (outward ? rank > bound : rank < bound) return;
        seen.add(other);
        region.push(other);
        stack.push(other);
      };
      if (outward) this._graph.forEachOut(node, expand);
      else this._graph.forEachIn(node, expand);
      if (cyclic) return null;
    }
    return region;
  }
}
