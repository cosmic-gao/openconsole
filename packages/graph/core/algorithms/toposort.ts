/**
 * 拓扑排序家族：{@link CycleError} 及 toposort / topology / cycles / isCyclic / ranks。
 */

import type { Cycles, IntoDegree, NodeId, Topology, Walkable } from '../types';

/** 拓扑排序检测到环时抛出的错误。 */
export class CycleError extends Error {
  /** 环上的节点 ID 列表，按 Kahn 算法残余顺序记录。 */
  public readonly cycleNodes: NodeId[];

  /**
   * @param cycleNodes 环上的节点 ID 列表
   */
  public constructor(cycleNodes: NodeId[]) {
    super(`Cycle detected involving nodes: ${cycleNodes.map(String).join(' -> ')}`);
    this.name = 'CycleError';
    this.cycleNodes = cycleNodes;
  }
}

/**
 * Kahn 算法拓扑排序。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @param onCycle 检测到环时的回调，默认抛出 {@link CycleError}
 * @returns 拓扑顺序的节点 ID 序列
 */
export function toposort<G extends Walkable>(
  graph: G,
  onCycle: (cycle: NodeId[]) => NodeId[] = (cycle) => {
    throw new CycleError(cycle);
  },
): NodeId[] {
  return topology(graph, onCycle).order;
}

/**
 * 带环路信息的拓扑排序。
 *
 * @remarks
 * 入度计算优先走快路径：若 `graph` 实现了 {@link IntoDegree}，直接调用 `inDegree(id)`；
 * 否则按 `outgoingNeighbors` 扫描重建。
 *
 * @template G 满足 {@link Walkable}，可选实现 {@link IntoDegree}
 * @param graph 图实例
 * @param onCycle 检测到环时的回调，默认按原始顺序追加环上节点
 * @returns 排序结果与环路信息
 */
export function topology<G extends Walkable & Partial<IntoDegree>>(
  graph: G,
  onCycle: (cycle: NodeId[]) => NodeId[] = (cycle) => cycle,
): Topology {
  const inDegree = new Map<NodeId, number>();
  const nodeOrder: NodeId[] = [];

  for (const nodeId of graph.nodeIds) {
    nodeOrder.push(nodeId);
    inDegree.set(nodeId, 0);
  }

  if (typeof graph.inDegree === 'function') {
    // 快路径：直接读 IntoDegree（Graph 的 inDegree 是 O(num_inputs)）
    for (const nodeId of nodeOrder) {
      inDegree.set(nodeId, graph.inDegree(nodeId));
    }
  } else {
    // 慢路径：扫出邻居重建
    for (const nodeId of nodeOrder) {
      for (const neighbor of graph.outgoingNeighbors(nodeId)) {
        // 跳过孤儿邻居（不在 nodeIds 拓扑空间内）。
        if (!inDegree.has(neighbor)) continue;
        inDegree.set(neighbor, inDegree.get(neighbor)! + 1);
      }
    }
  }

  const queue: NodeId[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId);
  }

  const order: NodeId[] = [];
  let head = 0;
  while (head < queue.length) {
    const nodeId = queue[head++]!;
    order.push(nodeId);
    for (const neighbor of graph.outgoingNeighbors(nodeId)) {
      const current = inDegree.get(neighbor);
      if (current === undefined) continue; // 孤儿邻居
      const remaining = current - 1;
      inDegree.set(neighbor, remaining);
      if (remaining === 0) queue.push(neighbor);
    }
  }

  const cycleNodes: NodeId[] = [];
  if (order.length < nodeOrder.length) {
    const visited = new Set<NodeId>(order);
    for (const nodeId of nodeOrder) {
      if (!visited.has(nodeId)) cycleNodes.push(nodeId);
    }
    order.push(...onCycle(cycleNodes));
  }

  return {
    order,
    cycles: {
      hasCycle: cycleNodes.length > 0,
      cycleNodes,
    },
  };
}

/**
 * 检测图中是否存在环路。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @returns 环路信息
 */
export function cycles<G extends Walkable>(graph: G): Cycles {
  return topology(graph).cycles;
}

/**
 * 检测图是否含环（{@link cycles} 的布尔快捷形式）。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 */
export function isCyclic<G extends Walkable>(graph: G): boolean {
  return cycles(graph).hasCycle;
}

/**
 * 给每个节点分配一个拓扑序中的位置（0 起，含环时环上节点尾部追加）。
 *
 * @remarks
 * 调用方可凭它把任意节点列表按拓扑顺序排序，无需把"拓扑后的后继 / 前驱"
 * 这样的派生函数挂在公开面上。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 */
export function ranks<G extends Walkable>(graph: G): Map<NodeId, number> {
  const order = toposort(graph, (cycle) => cycle);
  const map = new Map<NodeId, number>();
  for (let i = 0; i < order.length; i++) map.set(order[i]!, i);
  return map;
}
