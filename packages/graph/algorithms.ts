/**
 * 图算法模块
 *
 * @remarks
 * 参考 petgraph 风格，算法与存储解耦。
 * 任何实现 GraphBase / IntoNeighbors / IntoEdges / IntoDegree 等 trait 的图都可以使用这些算法。
 *
 * 命名约定（用户偏好）：算法导出使用单个英文单词；不得已使用两词组合。
 */

import type {
  EdgeRef,
  GraphBase,
  GraphRef,
  IntoDegree,
  IntoEdgeRefs,
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
import { reversed } from './adapters';
import { dfsVisit } from './visitors';

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
  return toposortFull(graph, onCycle).order;
}

/**
 * 带环路信息的拓扑排序。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @param onCycle 检测到环时的回调，默认按原始顺序追加环上节点
 * @returns 排序结果与环路信息
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
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @returns 环路信息
 */
export function cycles<G extends Walkable>(graph: G): CycleInfo {
  return toposortFull(graph).cycleInfo;
}

/**
 * 强连通分量 (Tarjan 算法，迭代实现避免深图栈溢出)。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
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
 * @template G 实现 {@link IntoNeighbors} 的图类型
 * @param graph 图实例
 * @param start 起始节点
 * @yields 按 DFS 顺序访问到的节点 ID
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
 * @template G 实现 {@link IntoNeighbors} 的图类型
 * @param graph 图实例
 * @param start 起始节点
 * @yields 按 BFS 顺序访问到的节点 ID
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
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @param nodeId 起点节点 ID
 * @returns 按拓扑顺序排好的后继 ID 列表
 */
export function topoSuccessors<G extends Walkable>(graph: G, nodeId: NodeId): NodeId[] {
  const order = ranks(graph);
  const successors = Array.from(graph.outgoingNeighbors(nodeId));
  return successors.sort(
    (a, b) =>
      (order.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * 按逆拓扑顺序排列指定节点的前驱。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @param nodeId 终点节点 ID
 * @returns 按逆拓扑顺序排好的前驱 ID 列表
 */
export function topoPredecessors<G extends Walkable>(graph: G, nodeId: NodeId): NodeId[] {
  const order = ranks(graph);
  const predecessors = Array.from(graph.incomingNeighbors(nodeId));
  return predecessors.sort((a, b) => (order.get(b) ?? -1) - (order.get(a) ?? -1));
}

/**
 * 计算所有节点的入度与出度。
 *
 * @remarks 优先使用 {@link IntoDegree}（O(N)）；缺省时枚举边集合（O(N + E)）。
 *
 * @template E 边权重类型
 * @template G 至少满足 `GraphBase & IntoEdges<E>`，可选实现 {@link IntoDegree}
 * @param graph 图实例
 * @returns 节点 ID → {@link DegreeInfo}
 */
export function degrees<E, G extends GraphBase & IntoEdges<E>>(
  graph: G,
): Map<NodeId, DegreeInfo> {
  const result = new Map<NodeId, DegreeInfo>();
  const withDegree = graph as G & Partial<IntoDegree>;

  if (typeof withDegree.inDegree === 'function' && typeof withDegree.outDegree === 'function') {
    for (const nodeId of graph.nodeIds) {
      result.set(nodeId, {
        inDegree: withDegree.inDegree(nodeId),
        outDegree: withDegree.outDegree(nodeId),
      });
    }
    return result;
  }

  for (const nodeId of graph.nodeIds) {
    result.set(nodeId, {
      inDegree: count(graph.incomingEdges(nodeId)),
      outDegree: count(graph.outgoingEdges(nodeId)),
    });
  }
  return result;
}

/**
 * 入度为 0 的源节点。
 *
 * @template G 同时满足 {@link GraphBase} 与 {@link IntoDegree} 的图类型
 * @param graph 图实例
 */
export function sources<G extends GraphBase & IntoDegree>(graph: G): NodeId[] {
  return pick(graph, (id) => graph.inDegree(id) === 0);
}

/**
 * 出度为 0 的汇节点。
 *
 * @template G 同时满足 {@link GraphBase} 与 {@link IntoDegree} 的图类型
 * @param graph 图实例
 */
export function sinks<G extends GraphBase & IntoDegree>(graph: G): NodeId[] {
  return pick(graph, (id) => graph.outDegree(id) === 0);
}

/**
 * 入度与出度均为 0 的孤立节点。
 *
 * @template G 同时满足 {@link GraphBase} 与 {@link IntoDegree} 的图类型
 * @param graph 图实例
 */
export function isolated<G extends GraphBase & IntoDegree>(graph: G): NodeId[] {
  return pick(graph, (id) => graph.inDegree(id) === 0 && graph.outDegree(id) === 0);
}

/**
 * 一次性快照所有节点的邻域（前驱 + 后继）。
 *
 * @remarks
 * 仅遍历 `outgoingNeighbors` 一次即可同步推出 `predecessors`，
 * 适用于只暴露出边却需要双向访问的图实现。注意这不是 petgraph 风格的
 * `Reversed<G>` 视图（那是一个零成本边翻转适配器）。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 * @template G 满足 {@link GraphRef} 的图类型
 * @param graph 图实例
 * @returns 节点 ID → `{ predecessors, successors }`
 */
export function neighborhood<N, E, G extends GraphRef<N, E>>(
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
 * 检测图是否含环（{@link cycles} 的布尔快捷形式）。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 */
export function isCyclic<G extends Walkable>(graph: G): boolean {
  return cycles(graph).hasCycle;
}

/**
 * 缩点：把每个强连通分量折叠为一个超节点，输出对应的 DAG 描述。
 *
 * @remarks
 * 仅返回纯数据描述，不构造新的 {@link Graph} 实例；调用方可根据需要进一步建图。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @returns 各分量数组、节点 → 分量序号映射、以及分量间的有向边
 */
export function condensation<G extends Walkable>(
  graph: G,
): {
  components: NodeId[][];
  componentOf: Map<NodeId, number>;
  edges: Array<{ from: number; to: number }>;
} {
  const components = scc(graph);
  const componentOf = new Map<NodeId, number>();
  for (let i = 0; i < components.length; i++) {
    for (const nodeId of components[i]!) componentOf.set(nodeId, i);
  }

  const seen = new Set<string>();
  const edges: Array<{ from: number; to: number }> = [];
  for (const nodeId of graph.nodeIds) {
    const from = componentOf.get(nodeId);
    if (from === undefined) continue;
    for (const neighbor of graph.outgoingNeighbors(nodeId)) {
      const to = componentOf.get(neighbor);
      if (to === undefined || to === from) continue;
      const key = `${from}->${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from, to });
    }
  }

  return { components, componentOf, edges };
}

/**
 * `source` 是否能到达 `target`。
 *
 * @template G 实现 {@link IntoNeighbors} 的图类型
 * @param graph 图实例
 * @param source 起点节点 ID
 * @param target 终点节点 ID
 * @returns 是否可达
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
 *
 * @template E 边的原始权重类型
 * @template W 默认权重类型
 * @param edge 原始边
 * @param defaultWeight `edge.weight` 为 `undefined` 时使用的默认值
 */
export function weighted<E, W>(edge: Edge<E>, defaultWeight: W): WeightedEdge<E | W> {
  return {
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    weight: edge.weight ?? defaultWeight,
  };
}

/**
 * 收集 `node` 的全部祖先（沿入边可达的节点，不含 `node` 本身）。
 *
 * @remarks 通过 {@link reversed} 在反向视图上跑 DFS，与正向 {@link dfs} 共享同一份算法。
 *
 * @template G 满足 {@link Walkable} 约束的图类型
 * @param graph 图实例
 * @param node 起点
 */
export function ancestors<G extends Walkable>(graph: G, node: NodeId): NodeId[] {
  const result: NodeId[] = [];
  let first = true;
  for (const visited of dfs(reversed(graph), node)) {
    if (first) {
      first = false;
      continue;
    }
    result.push(visited);
  }
  return result;
}

/**
 * 收集 `node` 的全部后代（沿出边可达的节点，不含 `node` 本身）。
 *
 * @template G 实现 {@link IntoNeighbors} 的图类型
 * @param graph 图实例
 * @param node 起点
 */
export function descendants<G extends IntoNeighbors>(graph: G, node: NodeId): NodeId[] {
  const result: NodeId[] = [];
  let first = true;
  for (const visited of dfs(graph, node)) {
    if (first) {
      first = false;
      continue;
    }
    result.push(visited);
  }
  return result;
}

/**
 * DFS 后序（finish-time）遍历，返回节点 ID 列表。
 *
 * @remarks
 * - 利用 {@link dfsVisit} 收集 `finish` 事件即得到后序；
 * - 后序的逆序就是 DAG 的拓扑序，常用于实现 Kosaraju SCC、构造支配树等。
 *
 * @template G 实现 {@link GraphBase} + {@link IntoNeighbors} 的图类型
 * @param graph 图实例
 * @param starts 起点序列；省略时按 `graph.nodeIds` 全图扫描
 */
export function postorder<G extends GraphBase & IntoNeighbors>(
  graph: G,
  starts?: Iterable<NodeId>,
): NodeId[] {
  const order: NodeId[] = [];
  dfsVisit(graph, starts ?? null, {
    finish(event) {
      order.push(event.node);
    },
  });
  return order;
}

/**
 * Kosaraju 算法求强连通分量，与 {@link scc} 互为参照实现。
 *
 * @remarks
 * 流程：
 * 1. 在原图上跑 DFS，按 finish-time 收集后序栈；
 * 2. 在 {@link reversed} 视图上按 1) 的逆序跑 DFS；每棵 DFS 树即一个强连通分量。
 *
 * @template G 实现 {@link GraphBase} + {@link IntoNeighbors} 的图类型
 * @param graph 图实例
 * @returns 各分量的节点 ID 数组
 */
export function kosarajuScc<G extends GraphBase & IntoNeighbors>(graph: G): NodeId[][] {
  const order = postorder(graph);
  const reversedGraph = reversed(graph);
  const components: NodeId[][] = [];
  const visited = new Set<NodeId>();

  // 内联 DFS 以共享外层 `visited`，否则每次调用 `dfs(reversedGraph, root)`
  // 都会在已分配分量的节点上重新走一遍，把整体复杂度从 O(V+E) 抬到 O(V·E)。
  const stack: NodeId[] = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const root = order[i]!;
    if (visited.has(root)) continue;
    const component: NodeId[] = [];
    stack.length = 0;
    stack.push(root);
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      component.push(node);
      for (const neighbor of reversedGraph.outgoingNeighbors(node)) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }
    if (component.length > 0) components.push(component);
  }
  return components;
}

/**
 * Dijkstra 单源最短路径（非负权重）。
 *
 * @remarks
 * - 仅依赖 {@link IntoEdgeRefs}；同一份算法可跑在 `Graph` / `MapGraph` / `MatrixGraph` 上；
 * - 返回 `start` 到所有可达节点的最短距离；可选 `end` 提前终止；
 * - 当前实现为 O(V²) 线性扫描（无堆），节点规模较大且性能敏感时再上二叉堆；
 * - 不支持负权边；若 `edgeCost` 返回负数行为未定义。
 *
 * @template E 边权重类型
 * @template G 满足 {@link GraphBase} + {@link IntoEdgeRefs}<E> 的图类型
 * @param graph 图实例
 * @param start 起点
 * @param end 提前终止的目标节点；传 `undefined` 计算到所有可达节点的距离
 * @param edgeCost 边代价函数，接收 {@link EdgeRef} 返回非负数
 * @returns 节点 ID → 从 `start` 出发的最短距离；不可达节点不出现在 Map 中
 */
export function dijkstra<E, G extends GraphBase & IntoEdgeRefs<E>>(
  graph: G,
  start: NodeId,
  end: NodeId | undefined,
  edgeCost: (edge: EdgeRef<E>) => number,
): Map<NodeId, number> {
  const distances = new Map<NodeId, number>();
  const visited = new Set<NodeId>();
  distances.set(start, 0);

  while (true) {
    let current: NodeId | undefined;
    let smallest = Infinity;
    for (const [node, dist] of distances) {
      if (visited.has(node)) continue;
      if (dist < smallest) {
        smallest = dist;
        current = node;
      }
    }
    if (current === undefined) break;
    visited.add(current);
    if (current === end) break;

    for (const edge of graph.outgoingEdgeRefs(current)) {
      if (visited.has(edge.target)) continue;
      const next = smallest + edgeCost(edge);
      const prev = distances.get(edge.target) ?? Infinity;
      if (next < prev) distances.set(edge.target, next);
    }
  }

  return distances;
}

/**
 * 计算可迭代序列长度。
 *
 * @internal
 */
function count(iter: Iterable<unknown>): number {
  let n = 0;
  for (const _ of iter) n++;
  return n;
}

/**
 * 由拓扑序构建 `nodeId → index` 查表，用于按拓扑顺序对节点进行排序。
 *
 * @internal
 */
function ranks<G extends Walkable>(graph: G): Map<NodeId, number> {
  const order = toposort(graph, (cycle) => cycle);
  const map = new Map<NodeId, number>();
  for (let i = 0; i < order.length; i++) map.set(order[i]!, i);
  return map;
}

/**
 * 按谓词筛选节点 ID 列表；公用 {@link sources}、{@link sinks}、{@link isolated} 的扫描骨架。
 *
 * @internal
 */
function pick<G extends GraphBase>(
  graph: G,
  predicate: (nodeId: NodeId) => boolean,
): NodeId[] {
  const result: NodeId[] = [];
  for (const nodeId of graph.nodeIds) {
    if (predicate(nodeId)) result.push(nodeId);
  }
  return result;
}
