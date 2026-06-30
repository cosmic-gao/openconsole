import { inDegrees } from "../internal";
import type {
  IntoDegree,
  Neighbors,
  NodeId,
  Topology,
  Walkable,
} from "../types";
import { toIterator } from "./iterator";

/**
 * 状态化的拓扑排序遍历器（Kahn 算法），可暂停与恢复。
 * 通过 {@link Topo.start} 构造，按入度为零的顺序逐个产出节点。
 */
export class Topo {
  /** 入度已降为零、等待产出的节点队列。 */
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

  /** 工厂方法：计算各节点入度并创建拓扑遍历器。 */
  public static start<G extends Walkable & Partial<IntoDegree>>(
    graph: G,
  ): Topo {
    const pending = inDegrees(graph);
    return new Topo(pending, pending.size);
  }

  /** 推进一步，返回下一个拓扑序节点；全部产出或遇环时返回 `undefined`。 */
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

  /** 将遍历器转换为可迭代对象，便于 `for...of` 消费。 */
  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return toIterator(() => this.next(graph));
  }

  /** 返回仍残留入度的节点，即参与环的节点；无环时为空数组。 */
  public cycleNodes(): NodeId[] {
    if (this._emitted >= this._total) return [];
    const remaining: NodeId[] = [];
    for (const [node, degree] of this._pending) {
      if (degree > 0) remaining.push(node);
    }
    return remaining;
  }

  /** 一次性消费全部节点，返回拓扑序及环检测结果。 */
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
