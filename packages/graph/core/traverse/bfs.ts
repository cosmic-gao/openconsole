import type { Neighbors, NodeId } from "../types";
import { toIterator } from "./iterator";

/**
 * 状态化的广度优先遍历器，可暂停与恢复。
 * 通过 {@link Bfs.start} 构造，调用 {@link Bfs.next} 逐层推进。
 */
export class Bfs {
  /** 待访问节点的队列（先进先出）。 */
  public readonly queue: NodeId[];
  /** 已访问节点的集合，用于去重。 */
  public readonly visited: Set<NodeId>;
  /** 队列读取游标，指向下一个待出队节点。 */
  public cursor: number;

  /** 创建遍历器，可选地以 `start` 作为起始节点入队。 */
  public constructor(start?: NodeId) {
    this.queue = [];
    this.visited = new Set();
    this.cursor = 0;
    if (start !== undefined) {
      this.queue.push(start);
      this.visited.add(start);
    }
  }

  /** 工厂方法：以 `start` 为起点创建遍历器。 */
  public static start<G extends Neighbors>(_graph: G, start: NodeId): Bfs {
    return new Bfs(start);
  }

  /** 推进一步，返回下一个被访问的节点；遍历结束时返回 `undefined`。 */
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

  /** 跳转到新起点 `start`，清空队列与已访问集合后重新开始。 */
  public moveTo(start: NodeId): void {
    this.queue.length = 0;
    this.visited.clear();
    this.queue.push(start);
    this.visited.add(start);
    this.cursor = 0;
  }

  /** 重置遍历器状态，清空队列、已访问集合与游标。 */
  public reset(): void {
    this.queue.length = 0;
    this.visited.clear();
    this.cursor = 0;
  }

  /** 将遍历器转换为可迭代对象，便于 `for...of` 消费。 */
  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return toIterator(() => this.next(graph));
  }
}
