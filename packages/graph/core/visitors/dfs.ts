import type { Neighbors, NodeId } from "../types";
import { toIterator } from "./iterator";

/**
 * 状态化的深度优先遍历器，可暂停与恢复。
 * 通过 {@link Dfs.start} 构造，调用 {@link Dfs.next} 逐步推进。
 */
export class Dfs {
  /** 待访问节点的栈（后进先出）。 */
  public readonly stack: NodeId[];
  /** 已发现节点的集合，用于去重。 */
  public readonly discovered: Set<NodeId>;

  /** 创建遍历器，可选地以 `start` 作为起始节点入栈。 */
  public constructor(start?: NodeId) {
    this.stack = [];
    this.discovered = new Set();
    if (start !== undefined) this.stack.push(start);
  }

  /** 工厂方法：以 `start` 为起点创建遍历器。 */
  public static start<G extends Neighbors>(_graph: G, start: NodeId): Dfs {
    return new Dfs(start);
  }

  /** 推进一步，返回下一个被发现的节点；遍历结束时返回 `undefined`。 */
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

  /** 跳转到新起点 `start`，清空栈但保留已发现集合。 */
  public moveTo(start: NodeId): void {
    this.stack.length = 0;
    this.stack.push(start);
  }

  /** 重置遍历器状态，清空栈与已发现集合。 */
  public reset(): void {
    this.stack.length = 0;
    this.discovered.clear();
  }

  /** 将遍历器转换为可迭代对象，便于 `for...of` 消费。 */
  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return toIterator(() => this.next(graph));
  }
}
