/**
 * Dfs：深度优先状态化遍历器（栈式，可暂停 / 恢复）。
 */

import type { Neighbors, NodeId } from '../types';
import { toIterator } from './iterator';

/**
 * 深度优先遍历器（迭代实现，可暂停 / 恢复）。
 *
 * @example
 * ```ts
 * const dfs = Dfs.start(graph, root);
 * while (true) {
 *   const node = dfs.next(graph);
 *   if (node === undefined) break;
 *   console.log(node);
 * }
 * ```
 */
export class Dfs {
  /** 待访问栈（自顶向下推进）。 */
  public readonly stack: NodeId[];

  /** 已 discover 的节点集合。 */
  public readonly discovered: Set<NodeId>;

  /**
   * @param start 起点节点 ID
   */
  public constructor(start?: NodeId) {
    this.stack = [];
    this.discovered = new Set();
    if (start !== undefined) {
      this.stack.push(start);
    }
  }

  /**
   * 工厂方法：从指定起点构造遍历器。
   *
   * @template G 实现 {@link Neighbors} 的图类型（仅用于类型推导，不保存引用）
   * @param graph 图实例
   * @param start 起点节点 ID
   * @returns 新建的遍历器
   */
  public static start<G extends Neighbors>(graph: G, start: NodeId): Dfs {
    void graph;
    return new Dfs(start);
  }

  /**
   * 推进一步，返回下一个 discovered 节点；遍历结束返回 `undefined`。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例（每次调用传入，便于在不同视图间切换）
   * @returns 下一个节点；遍历结束返回 `undefined`
   */
  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    while (this.stack.length > 0) {
      const nodeId = this.stack.pop()!;
      if (this.discovered.has(nodeId)) continue;
      this.discovered.add(nodeId);

      // 反向压栈以保持出邻居的原始访问顺序。
      const neighbors = Array.from(graph.downstream(nodeId));
      for (let i = neighbors.length - 1; i >= 0; i--) {
        const neighbor = neighbors[i]!;
        if (!this.discovered.has(neighbor)) this.stack.push(neighbor);
      }

      return nodeId;
    }
    return undefined;
  }

  /**
   * 跳转到新的起点（保留 discovered 集合）。
   *
   * @param start 新起点
   */
  public moveTo(start: NodeId): void {
    this.stack.length = 0;
    this.stack.push(start);
  }

  /** 清空 discovered 集合与栈，从头开始。 */
  public reset(): void {
    this.stack.length = 0;
    this.discovered.clear();
  }

  /**
   * 把遍历器适配为可迭代对象，便于 `for...of` 消费。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   * @returns 可迭代对象
   */
  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return toIterator(() => this.next(graph));
  }
}
