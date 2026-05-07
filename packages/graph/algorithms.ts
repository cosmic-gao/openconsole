/**
 * 图算法模块
 *
 * 参考 petgraph 风格，算法与存储解耦。
 * 任何实现 GraphBase / IntoNeighbors / IntoEdges / IntoDegree 等 trait 的图都可以使用这些算法。
 *
 * 命名约定（用户偏好）：算法导出使用单个英文单词；不得已使用两词组合。
 */

import type {
  GraphBase,
  GraphRef,
  IntoDegree,
  IntoEdges,
  IntoNeighbors,
  NodeId,
  Walkable,
  WeightedEdge,
  CycleInfo,
  TopoSortResult,
  DegreeInfo,
} from './types';
import type { Edge } from './classic';

/** 拓扑排序检测到环时抛出的错误。 */
export class CycleError extends Error {
  public readonly cycleNodes: NodeId[];

  public constructor(cycleNodes: NodeId[]) {
    super(`Cycle detected involving nodes: ${cycleNodes.map(String).join(' -> ')}`);
    this.name = 'CycleError';
    this.cycleNodes = cycleNodes;
  }
}

/**
 * Kahn 算法拓扑排序。
 *
 * @param graph 任何满足 {@link Walkable} 约束的图
 * @param onCycle 检测到环时的回调，默认抛出 {@link CycleError}
 * @returns 拓扑顺序的节点 ID 序列
 */
export function toposort<G extends Walkable>(
  graph: G,
  onCycle: (cycle: NodeId[]) => NodeId[] = (cycle) => {
    throw new CycleError(cycle);
  },
): NodeId[] {
  return toposortFull(graph, onCycle).order;
}

/**
 * 带环路信息的拓扑排序。
 *
 * @param graph 任何满足 {@link Walkable} 约束的图
 * @param onCycle 检测到环时的回调，默认按原始顺序追加环上节点
 * @returns 包含排序结果与环路信息
 */
export function toposortFull<G extends Walkable>(
  graph: G,
  onCycle: (cycle: NodeId[]) => NodeId[] = (cycle) => cycle,
): TopoSortResult {
  const inDegree = new Map<NodeId, number>();
  const adjacency = new Map<NodeId, NodeId[]>();
  const nodeOrder: NodeId[] = [];

  for (const nodeId of graph.nodeIds) {
    nodeOrder.push(nodeId);
    inDegree.set(nodeId, 0);
    adjacency.set(nodeId, []);
  }

  for (const nodeId of nodeOrder) {
    const succs = adjacency.get(nodeId)!;
    for (const neighbor of graph.outgoingNeighbors(nodeId)) {
      succs.push(neighbor);
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) + 1);
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
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      const remaining = (inDegree.get(neighbor) ?? 1) - 1;
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
    cycleInfo: {
      hasCycle: cycleNodes.length > 0,
      cycleNodes,
    },
  };
}

/**
 * 检测图中是否存在环路。
 *
 * @param graph 任何满足 {@link Walkable} 约束的图
 */
export function cycles<G extends Walkable>(graph: G): CycleInfo {
  return toposortFull(graph).cycleInfo;
}

/**
 * 强连通分量 (Tarjan 算法，迭代实现避免深图栈溢出)。
 *
 * @param graph 任何满足 {@link Walkable} 约束的图
 * @returns 各分量的节点 ID 数组
 */
export function scc<G extends Walkable>(graph: G): NodeId[][] {
  const index = new Map<NodeId, number>();
  const lowlink = new Map<NodeId, number>();
  const onStack = new Set<NodeId>();
  const tarjanStack: NodeId[] = [];
  const components: NodeId[][] = [];
  let counter = 0;

  type Frame = { nodeId: NodeId; iter: Iterator<NodeId>; pendingChild: NodeId | null };
  const callStack: Frame[] = [];

  const enter = (nodeId: NodeId): void => {
    index.set(nodeId, counter);
    lowlink.set(nodeId, counter);
    counter++;
    tarjanStack.push(nodeId);
    onStack.add(nodeId);
    callStack.push({
      nodeId,
      iter: graph.outgoingNeighbors(nodeId)[Symbol.iterator](),
      pendingChild: null,
    });
  };

  for (const root of graph.nodeIds) {
    if (index.has(root)) continue;
    enter(root);

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1]!;

      if (frame.pendingChild !== null) {
        const child = frame.pendingChild;
        frame.pendingChild = null;
        lowlink.set(frame.nodeId, Math.min(lowlink.get(frame.nodeId)!, lowlink.get(child)!));
      }

      const next = frame.iter.next();
      if (!next.done) {
        const neighbor = next.value;
        if (!index.has(neighbor)) {
          frame.pendingChild = neighbor;
          enter(neighbor);
        } else if (onStack.has(neighbor)) {
          lowlink.set(
            frame.nodeId,
            Math.min(lowlink.get(frame.nodeId)!, index.get(neighbor)!),
          );
        }
        continue;
      }

      if (lowlink.get(frame.nodeId) === index.get(frame.nodeId)) {
        const component: NodeId[] = [];
        let popped: NodeId | undefined;
        do {
          popped = tarjanStack.pop();
          if (popped !== undefined) {
            onStack.delete(popped);
            component.push(popped);
          }
        } while (popped !== undefined && popped !== frame.nodeId);
        components.push(component.reverse());
      }

      callStack.pop();
    }
  }

  return components;
}

/**
 * DFS 生成器（迭代版，支持延迟消费）。
 *
 * @param graph 实现 {@link IntoNeighbors} 的图
 * @param start 起始节点
 */
export function* dfs<G extends IntoNeighbors>(
  graph: G,
  start: NodeId,
): Generator<NodeId, void, unknown> {
  const stack: NodeId[] = [start];
  const visited = new Set<NodeId>();

  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    yield nodeId;

    const neighbors = Array.from(graph.outgoingNeighbors(nodeId));
    for (let i = neighbors.length - 1; i >= 0; i--) {
      const neighbor = neighbors[i]!;
      if (!visited.has(neighbor)) stack.push(neighbor);
    }
  }
}

/**
 * BFS 生成器。使用游标推进队列以避免 `Array#shift` 的 O(n) 拷贝。
 *
 * @param graph 实现 {@link IntoNeighbors} 的图
 * @param start 起始节点
 */
export function* bfs<G extends IntoNeighbors>(
  graph: G,
  start: NodeId,
): Generator<NodeId, void, unknown> {
  const queue: NodeId[] = [start];
  const visited = new Set<NodeId>([start]);
  let head = 0;

  while (head < queue.length) {
    const nodeId = queue[head++]!;
    yield nodeId;

    for (const neighbor of graph.outgoingNeighbors(nodeId)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
}

/**
 * 按拓扑顺序排列指定节点的后继。
 */
export function topoSuccessors<G extends Walkable>(graph: G, nodeId: NodeId): NodeId[] {
  const order = toposort(graph, (cycle) => cycle);
  const indexMap = new Map<NodeId, number>();
  for (let i = 0; i < order.length; i++) indexMap.set(order[i]!, i);

  const successors = Array.from(graph.outgoingNeighbors(nodeId));
  return successors.sort(
    (a, b) =>
      (indexMap.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (indexMap.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * 按逆拓扑顺序排列指定节点的前驱。
 */
export function topoPredecessors<G extends Walkable>(graph: G, nodeId: NodeId): NodeId[] {
  const order = toposort(graph, (cycle) => cycle);
  const indexMap = new Map<NodeId, number>();
  for (let i = 0; i < order.length; i++) indexMap.set(order[i]!, i);

  const predecessors = Array.from(graph.incomingNeighbors(nodeId));
  return predecessors.sort((a, b) => (indexMap.get(b) ?? -1) - (indexMap.get(a) ?? -1));
}

/**
 * 计算所有节点的入度与出度。
 */
export function degrees<E, G extends GraphBase & IntoEdges<E>>(
  graph: G,
): Map<NodeId, DegreeInfo> {
  const result = new Map<NodeId, DegreeInfo>();

  for (const nodeId of graph.nodeIds) {
    let outDegree = 0;
    for (const _ of graph.outgoingEdges(nodeId)) outDegree++;
    let inDegree = 0;
    for (const _ of graph.incomingEdges(nodeId)) inDegree++;
    result.set(nodeId, { inDegree, outDegree });
  }

  return result;
}

/** 入度为 0 的源节点。 */
export function sources<G extends GraphBase & IntoDegree>(graph: G): NodeId[] {
  const result: NodeId[] = [];
  for (const nodeId of graph.nodeIds) {
    if (graph.inDegree(nodeId) === 0) result.push(nodeId);
  }
  return result;
}

/** 出度为 0 的汇节点。 */
export function sinks<G extends GraphBase & IntoDegree>(graph: G): NodeId[] {
  const result: NodeId[] = [];
  for (const nodeId of graph.nodeIds) {
    if (graph.outDegree(nodeId) === 0) result.push(nodeId);
  }
  return result;
}

/** 入度与出度均为 0 的孤立节点。 */
export function isolated<G extends GraphBase & IntoDegree>(graph: G): NodeId[] {
  const result: NodeId[] = [];
  for (const nodeId of graph.nodeIds) {
    if (graph.inDegree(nodeId) === 0 && graph.outDegree(nodeId) === 0) result.push(nodeId);
  }
  return result;
}

/**
 * 反向邻接信息。
 *
 * @returns 节点 ID → `{ predecessors, successors }`
 */
export function reverse<N, E, G extends GraphRef<N, E>>(
  graph: G,
): Map<NodeId, { predecessors: NodeId[]; successors: NodeId[] }> {
  const result = new Map<NodeId, { predecessors: NodeId[]; successors: NodeId[] }>();

  for (const nodeId of graph.nodeIds) {
    result.set(nodeId, { predecessors: [], successors: [] });
  }

  for (const nodeId of graph.nodeIds) {
    const info = result.get(nodeId)!;
    for (const succ of graph.outgoingNeighbors(nodeId)) {
      info.successors.push(succ);
      const succEntry = result.get(succ);
      if (succEntry) succEntry.predecessors.push(nodeId);
    }
  }

  return result;
}

/**
 * `source` 是否能到达 `target`。
 */
export function reachable<G extends IntoNeighbors>(
  graph: G,
  source: NodeId,
  target: NodeId,
): boolean {
  if (source === target) return true;

  const visited = new Set<NodeId>();
  const stack: NodeId[] = [source];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const neighbor of graph.outgoingNeighbors(current)) {
      if (!visited.has(neighbor)) stack.push(neighbor);
    }
  }

  return false;
}

/**
 * 将边映射为 {@link WeightedEdge}，缺省时使用 `defaultWeight`。
 */
export function weighted<E, W>(edge: Edge<E>, defaultWeight: W): WeightedEdge<E | W> {
  return {
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    weight: edge.weight ?? defaultWeight,
  };
}
