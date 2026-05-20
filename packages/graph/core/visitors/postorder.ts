/**
 * Postorder：DFS 后序状态化遍历器（finish-time 顺序）。
 */

import type { Neighbors, NodeId } from '../types';
import { toIterator } from './iterator';

/**
 * DFS 后序状态化遍历器（迭代实现，可暂停 / 恢复）。
 *
 * @remarks
 * - 每个 `next(graph)` 调用返回下一个 finish 节点；
 * - 后序意味着节点在所有后代访问完成后才被产出，逆后序天然就是 DAG 的拓扑序；
 * - 内部维护栈帧 `(node, neighbors)`，无递归调用，深图也不会栈溢出。
 *
 * @example
 * ```ts
 * const post = Postorder.start(graph, root);
 * while (true) {
 *   const node = post.next(graph);
 *   if (node === undefined) break;
 *   // node 已完成所有后代访问
 * }
 * ```
 */
export class Postorder {
  /** 当前 DFS 调用栈：每帧持有节点与其后继迭代器。 */
  public readonly stack: Array<{ node: NodeId; neighbors: Iterator<NodeId> }>;

  /** 已 discover 的节点集合（含已 finish）。 */
  public readonly discovered: Set<NodeId>;

  /** 已 finish 的节点集合。 */
  public readonly finished: Set<NodeId>;

  /** 待 lazy 推入栈的起点（首次 `next()` 时消费）。 */
  private _initial: NodeId | undefined;

  /**
   * @param start 起点节点 ID（lazy 入栈，等到首次 `next(graph)` 时再用 graph 拿迭代器）
   */
  public constructor(start?: NodeId) {
    this.stack = [];
    this.discovered = new Set();
    this.finished = new Set();
    this._initial = start;
  }

  /**
   * 工厂方法：从指定起点构造遍历器（即时入栈，直接持有 graph 拿到的子迭代器）。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   * @param start 起点节点 ID
   * @returns 新建的遍历器
   */
  public static start<G extends Neighbors>(graph: G, start: NodeId): Postorder {
    const instance = new Postorder();
    instance.discovered.add(start);
    instance.stack.push({
      node: start,
      neighbors: graph.downstream(start)[Symbol.iterator](),
    });
    return instance;
  }

  /**
   * 推进一步，返回下一个 finish 节点；遍历结束返回 `undefined`。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   * @returns 下一个 finish 节点；遍历结束返回 `undefined`
   */
  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    if (this._initial !== undefined) {
      const start = this._initial;
      this._initial = undefined;
      this.discovered.add(start);
      this.stack.push({
        node: start,
        neighbors: graph.downstream(start)[Symbol.iterator](),
      });
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
        this.stack.push({
          node: child,
          neighbors: graph.downstream(child)[Symbol.iterator](),
        });
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

  /**
   * 跳转到新的起点（保留 discovered / finished 集合）。
   *
   * @param start 新起点
   */
  public moveTo(start: NodeId): void {
    this.stack.length = 0;
    this._initial = start;
  }

  /** 清空状态，从头开始。 */
  public reset(): void {
    this.stack.length = 0;
    this.discovered.clear();
    this.finished.clear();
    this._initial = undefined;
  }

  /**
   * 适配为可迭代对象。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   * @returns 可迭代对象
   */
  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return toIterator(() => this.next(graph));
  }
}
