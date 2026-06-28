import type { NodeId, Subscribable, Walkable } from '../types';
import { topology } from './toposort';

export class IncrementalTopo<N = unknown, E = unknown> {
  private readonly _ranks = new Map<NodeId, number>();

  private _maxRank = -1;

  private _dirty = false;

  private _hasCycle = false;

  private _cycleNodes: NodeId[] = [];

  private _cycleSet = new Set<NodeId>();

  private _dense = true;

  private readonly _unsubscribers: Array<() => void> = [];

  public constructor(
    private readonly _graph: Walkable & Subscribable<N, E>,
  ) {
    this._recompute();
    this._unsubscribers.push(
      _graph.signal.on('nodeAdded', ({ node }) => this._addNode(node.id)),
      _graph.signal.on('nodeDropped', ({ node }) => this._removeNode(node.id)),
      _graph.signal.on('edgeAdded', ({ edge }) => this._addEdge(edge.sourceId, edge.targetId)),
      _graph.signal.on('edgeDropped', () => this._removeEdge()),
    );
  }

  public rank(id: NodeId): number | undefined {
    if (this._dirty) this._recompute();
    return this._ranks.get(id);
  }

  public compare(a: NodeId, b: NodeId): number {
    if (this._dirty) this._recompute();
    const ra = this._ranks.get(a);
    const rb = this._ranks.get(b);
    if (ra === undefined || rb === undefined) return 0;
    return ra - rb;
  }

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

  public get hasCycle(): boolean {
    if (this._dirty) this._recompute();
    return this._hasCycle;
  }

  public get cycleNodes(): readonly NodeId[] {
    if (this._dirty) this._recompute();
    return this._cycleNodes;
  }

  public sync(): void {
    this._recompute();
  }

  public dispose(): void {
    for (const off of this._unsubscribers) off();
    this._unsubscribers.length = 0;
  }

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

  private _addNode(nodeId: NodeId): void {
    if (this._ranks.has(nodeId)) return;
    this._ranks.set(nodeId, ++this._maxRank);
    if (this._maxRank !== this._ranks.size - 1) this._dense = false;
  }

  private _removeNode(nodeId: NodeId): void {
    const rank = this._ranks.get(nodeId);
    if (rank === undefined) return;
    this._ranks.delete(nodeId);
    if (rank === this._maxRank && this._dense) {
      this._maxRank--;
    } else {
      this._dense = false;
    }
    if (this._cycleSet.has(nodeId)) this._dirty = true;
  }

  private _addEdge(sourceId: NodeId, targetId: NodeId): void {
    if (sourceId === targetId || this._hasCycle) {
      this._dirty = true;
      return;
    }
    const sourceRank = this._ranks.get(sourceId);
    const targetRank = this._ranks.get(targetId);
    if (sourceRank === undefined || targetRank === undefined) {
      this._dirty = true;
      return;
    }
    if (sourceRank < targetRank) return;

    const lowerBound = targetRank;
    const upperBound = sourceRank;
    const graph = this._graph;
    const ranks = this._ranks;

    const forward = this._collect(targetId, (node) => graph.outNeighbors(node), (rank) => rank <= upperBound, sourceId);
    if (forward === null) {
      this._dirty = true;
      return;
    }
    const backward = this._collect(sourceId, (node) => graph.inNeighbors(node), (rank) => rank >= lowerBound);

    const byRank = (a: NodeId, b: NodeId): number => ranks.get(a)! - ranks.get(b)!;
    backward.sort(byRank);
    forward.sort(byRank);

    const slots: number[] = new Array(backward.length + forward.length);
    let i = 0;
    for (const node of backward) slots[i++] = ranks.get(node)!;
    for (const node of forward) slots[i++] = ranks.get(node)!;
    slots.sort((a, b) => a - b);

    i = 0;
    for (const node of backward) ranks.set(node, slots[i++]!);
    for (const node of forward) ranks.set(node, slots[i++]!);
  }

  private _collect(
    start: NodeId,
    expand: (node: NodeId) => Iterable<NodeId>,
    accept: (rank: number) => boolean,
  ): NodeId[];
  private _collect(
    start: NodeId,
    expand: (node: NodeId) => Iterable<NodeId>,
    accept: (rank: number) => boolean,
    abort: NodeId,
  ): NodeId[] | null;
  private _collect(
    start: NodeId,
    expand: (node: NodeId) => Iterable<NodeId>,
    accept: (rank: number) => boolean,
    abort?: NodeId,
  ): NodeId[] | null {
    const visited = new Set<NodeId>([start]);
    const region: NodeId[] = [start];
    const stack: NodeId[] = [start];
    while (stack.length > 0) {
      const node = stack.pop()!;
      for (const neighbor of expand(node)) {
        if (visited.has(neighbor)) continue;
        if (neighbor === abort) return null;
        const rank = this._ranks.get(neighbor);
        if (rank === undefined || !accept(rank)) continue;
        visited.add(neighbor);
        region.push(neighbor);
        stack.push(neighbor);
      }
    }
    return region;
  }

  private _removeEdge(): void {
    if (this._hasCycle) this._dirty = true;
  }
}
