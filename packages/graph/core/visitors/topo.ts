/**
 * Topo：拓扑序状态化遍历器（Kahn 算法的可暂停版）。
 */

import type {
  IntoDegree,
  Neighbors,
  NodeId,
  Topology,
  Walkable,
} from '../types';
import { asIterator } from './iterator';

/**
 * 拓扑序状态化遍历器（Kahn 算法的可暂停版）。
 *
 * @remarks
 * - `next(graph)` 一次返回一个入度为 0 的节点；
 * - 用 `_pending` 跟踪剩余入度，避免每次重新计算；
 * - 检测到环时 `next` 返回 `undefined`，可调用 {@link cycleNodes} 取得环上节点。
 *
 * @example
 * ```ts
 * const topo = Topo.start(graph);
 * for (const node of topo.iterator(graph)) {
 *   evaluate(node);
 * }
 * if (topo.cycleNodes().length > 0) console.warn('cycle detected');
 * ```
 */
export class Topo {
  /** 当前可输出的节点队列。 */
  public readonly queue: NodeId[];

  /** 节点 → 当前剩余入度。 */
  private _pending: Map<NodeId, number>;

  /** 队列读游标。 */
  private _head: number;

  /** 已经被 next() 输出的节点数（用于环检测）。 */
  private _emitted: number;

  /** 总节点数（构建时一次性确定）。 */
  private readonly _total: number;

  /**
   * 内部构造器；调用方应使用 {@link Topo.start}。
   *
   * @internal
   */
  private constructor(pending: Map<NodeId, number>, total: number) {
    this.queue = [];
    this._pending = pending;
    this._head = 0;
    this._emitted = 0;
    this._total = total;
    for (const [nodeId, degree] of pending) {
      if (degree === 0) this.queue.push(nodeId);
    }
  }

  /**
   * 工厂方法：基于图的当前结构构造拓扑遍历器。
   *
   * @template G 满足 {@link Walkable} + 可选 {@link IntoDegree} 的图类型
   * @param graph 图实例
   */
  public static start<G extends Walkable & Partial<IntoDegree>>(graph: G): Topo {
    const pending = new Map<NodeId, number>();

    if (typeof graph.inDegree === 'function') {
      for (const nodeId of graph.nodeIds) {
        pending.set(nodeId, graph.inDegree(nodeId));
      }
    } else {
      for (const nodeId of graph.nodeIds) pending.set(nodeId, 0);
      // 仅对 nodeIds 中的节点累计入度；`outgoingNeighbors` 偶发返回的孤儿节点
      // (不在 nodeIds 中) 不应被算入拓扑空间，否则会出现 emit count > total 的不一致。
      for (const nodeId of graph.nodeIds) {
        for (const neighbor of graph.outgoingNeighbors(nodeId)) {
          if (pending.has(neighbor)) {
            pending.set(neighbor, pending.get(neighbor)! + 1);
          }
        }
      }
    }

    return new Topo(pending, pending.size);
  }

  /**
   * 推进一步，返回拓扑序中下一个节点；剩余节点都在环上时返回 `undefined`。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   */
  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    if (this._head >= this.queue.length) return undefined;
    const nodeId = this.queue[this._head++]!;
    this._emitted++;
    for (const neighbor of graph.outgoingNeighbors(nodeId)) {
      // 跳过孤儿邻居（不在 nodeIds 拓扑空间内的节点）。否则会因 `?? 1 - 1 = 0`
      // 把它意外纳入队列，最终被 next() 输出。
      const current = this._pending.get(neighbor);
      if (current === undefined) continue;
      const remaining = current - 1;
      this._pending.set(neighbor, remaining);
      if (remaining === 0) this.queue.push(neighbor);
    }
    return nodeId;
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

  /** 当前已输出节点数 < 总数时即存在环；返回剩余的环上节点。 */
  public cycleNodes(): NodeId[] {
    if (this._emitted >= this._total) return [];
    const remaining: NodeId[] = [];
    for (const [nodeId, degree] of this._pending) {
      if (degree > 0) remaining.push(nodeId);
    }
    return remaining;
  }

  /** 一次性 drain 出全部拓扑序与环路信息（与 algorithms.topology 等价）。 */
  public collect<G extends Neighbors>(graph: G): Topology {
    const order: NodeId[] = [];
    while (true) {
      const node = this.next(graph);
      if (node === undefined) break;
      order.push(node);
    }
    const cycleNodes = this.cycleNodes();
    if (cycleNodes.length > 0) order.push(...cycleNodes);
    return {
      order,
      cycles: { hasCycle: cycleNodes.length > 0, cycleNodes },
    };
  }
}
