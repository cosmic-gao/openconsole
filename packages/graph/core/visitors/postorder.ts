import type { Neighbors, NodeId } from '../types';
import { toIterator } from './iterator';

export class Postorder {
  public readonly stack: Array<{ node: NodeId; neighbors: Iterator<NodeId> }>;
  public readonly discovered: Set<NodeId>;
  public readonly finished: Set<NodeId>;
  private _initial: NodeId | undefined;

  public constructor(start?: NodeId) {
    this.stack = [];
    this.discovered = new Set();
    this.finished = new Set();
    this._initial = start;
  }

  public static start<G extends Neighbors>(graph: G, start: NodeId): Postorder {
    const instance = new Postorder();
    instance.discovered.add(start);
    instance.stack.push({ node: start, neighbors: graph.outNeighbors(start)[Symbol.iterator]() });
    return instance;
  }

  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    if (this._initial !== undefined) {
      const start = this._initial;
      this._initial = undefined;
      this.discovered.add(start);
      this.stack.push({ node: start, neighbors: graph.outNeighbors(start)[Symbol.iterator]() });
    }

    while (this.stack.length > 0) {
      const frame = this.stack[this.stack.length - 1]!;

      let pushed = false;
      while (true) {
        const step = frame.neighbors.next();
        if (step.done) break;
        const child = step.value;
        if (this.discovered.has(child)) continue;
        this.discovered.add(child);
        this.stack.push({ node: child, neighbors: graph.outNeighbors(child)[Symbol.iterator]() });
        pushed = true;
        break;
      }

      if (pushed) continue;

      this.stack.pop();
      this.finished.add(frame.node);
      return frame.node;
    }
    return undefined;
  }

  public moveTo(start: NodeId): void {
    this.stack.length = 0;
    this._initial = start;
  }

  public reset(): void {
    this.stack.length = 0;
    this.discovered.clear();
    this.finished.clear();
    this._initial = undefined;
  }

  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return toIterator(() => this.next(graph));
  }
}
