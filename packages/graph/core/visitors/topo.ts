import { inDegrees } from '../internal';
import type { IntoDegree, Neighbors, NodeId, Topology, Walkable } from '../types';
import { toIterator } from './iterator';

export class Topo {
  public readonly queue: NodeId[];
  private _pending: Map<NodeId, number>;
  private _head: number;
  private _emitted: number;
  private readonly _total: number;

  private constructor(pending: Map<NodeId, number>, total: number) {
    this.queue = [];
    this._pending = pending;
    this._head = 0;
    this._emitted = 0;
    this._total = total;
    for (const [node, degree] of pending) {
      if (degree === 0) this.queue.push(node);
    }
  }

  public static start<G extends Walkable & Partial<IntoDegree>>(graph: G): Topo {
    const pending = inDegrees(graph);
    return new Topo(pending, pending.size);
  }

  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    if (this._head >= this.queue.length) return undefined;
    const node = this.queue[this._head++]!;
    this._emitted++;
    for (const neighbor of graph.outNeighbors(node)) {
      const current = this._pending.get(neighbor);
      if (current === undefined) continue;
      const remaining = current - 1;
      this._pending.set(neighbor, remaining);
      if (remaining === 0) this.queue.push(neighbor);
    }
    return node;
  }

  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return toIterator(() => this.next(graph));
  }

  public cycleNodes(): NodeId[] {
    if (this._emitted >= this._total) return [];
    const remaining: NodeId[] = [];
    for (const [node, degree] of this._pending) {
      if (degree > 0) remaining.push(node);
    }
    return remaining;
  }

  public collect<G extends Neighbors>(graph: G): Topology {
    const order: NodeId[] = [];
    while (true) {
      const node = this.next(graph);
      if (node === undefined) break;
      order.push(node);
    }
    const cycleNodes = this.cycleNodes();
    if (cycleNodes.length > 0) order.push(...cycleNodes);
    return { order, cycles: { hasCycle: cycleNodes.length > 0, cycleNodes } };
  }
}
