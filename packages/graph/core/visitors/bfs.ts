import type { Neighbors, NodeId } from '../types';
import { toIterator } from './iterator';

export class Bfs {
  public readonly queue: NodeId[];
  public readonly visited: Set<NodeId>;
  public cursor: number;

  public constructor(start?: NodeId) {
    this.queue = [];
    this.visited = new Set();
    this.cursor = 0;
    if (start !== undefined) {
      this.queue.push(start);
      this.visited.add(start);
    }
  }

  public static start<G extends Neighbors>(_graph: G, start: NodeId): Bfs {
    return new Bfs(start);
  }

  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    if (this.cursor >= this.queue.length) return undefined;
    const node = this.queue[this.cursor++]!;
    for (const neighbor of graph.outNeighbors(node)) {
      if (this.visited.has(neighbor)) continue;
      this.visited.add(neighbor);
      this.queue.push(neighbor);
    }
    return node;
  }

  public moveTo(start: NodeId): void {
    this.queue.length = 0;
    this.visited.clear();
    this.queue.push(start);
    this.visited.add(start);
    this.cursor = 0;
  }

  public reset(): void {
    this.queue.length = 0;
    this.visited.clear();
    this.cursor = 0;
  }

  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return toIterator(() => this.next(graph));
  }
}
