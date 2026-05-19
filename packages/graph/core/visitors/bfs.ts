/**
 * Bfs：广度优先状态化遍历器。
 */

import type { Neighbors, NodeId } from '../types';
import { asIterator } from './iterator';

/**
 * 广度优先遍历器（迭代实现，使用游标队列）。
 *
 * @example
 * ```ts
 * const bfs = Bfs.start(graph, root);
 * while (true) {
 *   const node = bfs.next(graph);
 *   if (node === undefined) break;
 * }
 * ```
 */
export class Bfs {
  /** 待访问队列（用游标推进，避免 `Array#shift` 的 O(n) 拷贝）。 */
  public readonly queue: NodeId[];

  /** 已访问节点集合。 */
  public readonly visited: Set<NodeId>;

  /** 队列读游标。 */
  private _head: number;

  /**
   * @param start 起点节点 ID
   */
  public constructor(start?: NodeId) {
    this.queue = [];
    this.visited = new Set();
    this._head = 0;
    if (start !== undefined) {
      this.queue.push(start);
      this.visited.add(start);
    }
  }

  /**
   * 工厂方法：从指定起点构造遍历器。
   *
   * @param _graph 图实例（仅用于类型推导）
   * @param start 起点节点 ID
   */
  public static start<G extends Neighbors>(_graph: G, start: NodeId): Bfs {
    return new Bfs(start);
  }

  /**
   * 推进一步，返回下一个访问到的节点；遍历结束返回 `undefined`。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   */
  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    if (this._head >= this.queue.length) return undefined;
    const nodeId = this.queue[this._head++]!;
    for (const neighbor of graph.outgoingNeighbors(nodeId)) {
      if (this.visited.has(neighbor)) continue;
      this.visited.add(neighbor);
      this.queue.push(neighbor);
    }
    return nodeId;
  }

  /**
   * 重置遍历器到新的起点。
   *
   * @param start 新起点
   */
  public moveTo(start: NodeId): void {
    this.queue.length = 0;
    this.visited.clear();
    this.queue.push(start);
    this.visited.add(start);
    this._head = 0;
  }

  /** 清空状态。 */
  public reset(): void {
    this.queue.length = 0;
    this.visited.clear();
    this._head = 0;
  }

  /**
   * 适配为可迭代对象。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   */
  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return asIterator(() => this.next(graph));
  }
}
