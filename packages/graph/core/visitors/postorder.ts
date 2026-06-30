import type { Neighbors, NodeId } from "../types";
import { toIterator } from "./iterator";

/**
 * 状态化的后序（DFS 完成序）遍历器，可暂停与恢复。
 * 在节点的所有后代都访问完毕后才将其产出。
 */
export class Postorder {
  /** 显式 DFS 栈，每帧保存节点及其邻居迭代器。 */
  public readonly stack: Array<{ node: NodeId; neighbors: Iterator<NodeId> }>;
  /** 已发现节点的集合，用于去重。 */
  public readonly discovered: Set<NodeId>;
  /** 已完成（已产出）节点的集合。 */
  public readonly finished: Set<NodeId>;
  private _initial: NodeId | undefined;

  /** 创建遍历器，可选地记录待延迟入栈的起始节点 `start`。 */
  public constructor(start?: NodeId) {
    this.stack = [];
    this.discovered = new Set();
    this.finished = new Set();
    this._initial = start;
  }

  /** 工厂方法：以 `start` 为起点创建遍历器并完成首帧入栈。 */
  public static start<G extends Neighbors>(graph: G, start: NodeId): Postorder {
    const instance = new Postorder();
    instance.discovered.add(start);
    instance.stack.push({
      node: start,
      neighbors: graph.outNeighbors(start)[Symbol.iterator](),
    });
    return instance;
  }

  /** 推进一步，返回下一个完成的节点；遍历结束时返回 `undefined`。 */
  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    if (this._initial !== undefined) {
      const start = this._initial;
      this._initial = undefined;
      this.discovered.add(start);
      this.stack.push({
        node: start,
        neighbors: graph.outNeighbors(start)[Symbol.iterator](),
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
          neighbors: graph.outNeighbors(child)[Symbol.iterator](),
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

  /** 跳转到新起点 `start`，清空栈但保留已发现与已完成集合。 */
  public moveTo(start: NodeId): void {
    this.stack.length = 0;
    this._initial = start;
  }

  /** 重置遍历器状态，清空栈、已发现集合与已完成集合。 */
  public reset(): void {
    this.stack.length = 0;
    this.discovered.clear();
    this.finished.clear();
    this._initial = undefined;
  }

  /** 将遍历器转换为可迭代对象，便于 `for...of` 消费。 */
  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return toIterator(() => this.next(graph));
  }
}
