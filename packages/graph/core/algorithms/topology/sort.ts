import { Cycle } from "../../model";
import { Topo } from "../../traverse";
import type {
  Cycles,
  IntoDegree,
  NodeId,
  Topology,
  Walkable,
} from "../../types";

/**
 * 拓扑排序（基于 Kahn 算法），返回节点的线性顺序。
 * 默认遇到环抛出 Cycle，可通过 onCycle 自定义处理。
 */
export function toposort<G extends Walkable>(
  graph: G,
  onCycle: (cycle: NodeId[]) => NodeId[] = (cycle) => {
    throw new Cycle(cycle);
  },
): NodeId[] {
  return topology(graph, onCycle).order;
}

/**
 * 拓扑排序并同时返回排序结果与环信息，不强制抛错。
 * 默认将环节点追加到顺序末尾。
 */
export function topology<G extends Walkable & Partial<IntoDegree>>(
  graph: G,
  onCycle: (cycle: NodeId[]) => NodeId[] = (cycle) => cycle,
): Topology {
  return Topo.start(graph).collect(graph, onCycle);
}

/**
 * 检测图中的环，返回是否有环及参与环的节点。
 */
export function cycles<G extends Walkable>(graph: G): Cycles {
  return topology(graph).cycles;
}

/**
 * 判断图是否包含环。
 */
export function isCyclic<G extends Walkable>(graph: G): boolean {
  return cycles(graph).hasCycle;
}

/**
 * 计算每个节点在拓扑顺序中的位次（rank），返回节点到序号的映射。
 */
export function ranks<G extends Walkable>(graph: G): Map<NodeId, number> {
  const order = toposort(graph, (cycle) => cycle);
  const map = new Map<NodeId, number>();
  for (let i = 0; i < order.length; i++) map.set(order[i]!, i);
  return map;
}
