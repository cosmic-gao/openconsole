import type { Neighbors, NodeId } from '../types';
import { toIterator } from './iterator';

export class Dfs {
  public readonly stack: NodeId[];
  public readonly discovered: Set<NodeId>;

  public constructor(start?: NodeId) {
    this.stack = [];
    this.discovered = new Set();
    if (start !== undefined) this.stack.push(start);
  }

  public static start<G extends Neighbors>(_graph: G, start: NodeId): Dfs {
    return new Dfs(start);
  }

  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    while (this.stack.length > 0) {
      const node = this.stack.pop()!;
      if (this.discovered.has(node)) continue;
      this.discovered.add(node);

      const neighbors = Array.from(graph.outNeighbors(node));
      for (let i = neighbors.length - 1; i >= 0; i--) {
        const neighbor = neighbors[i]!;
        if (!this.discovered.has(neighbor)) this.stack.push(neighbor);
      }

      return node;
    }
    return undefined;
  }

  public moveTo(start: NodeId): void {
    this.stack.length = 0;
    this.stack.push(start);
  }

  public reset(): void {
    this.stack.length = 0;
    this.discovered.clear();
  }

  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return toIterator(() => this.next(graph));
  }
}
