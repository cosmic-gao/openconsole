import { Cycle } from '../classic';
import type { Cycles, IntoDegree, NodeId, Topology, Walkable } from '../types';
import { Topo } from '../visitors';

export function toposort<G extends Walkable>(
  graph: G,
  onCycle: (cycle: NodeId[]) => NodeId[] = (cycle) => {
    throw new Cycle(cycle);
  },
): NodeId[] {
  return topology(graph, onCycle).order;
}

export function topology<G extends Walkable & Partial<IntoDegree>>(
  graph: G,
  onCycle: (cycle: NodeId[]) => NodeId[] = (cycle) => cycle,
): Topology {
  const topo = Topo.start(graph);
  const order: NodeId[] = [...topo.iterator(graph)];
  const cycleNodes = topo.cycleNodes();
  if (cycleNodes.length > 0) order.push(...onCycle(cycleNodes));
  return {
    order,
    cycles: { hasCycle: cycleNodes.length > 0, cycleNodes },
  };
}

export function cycles<G extends Walkable>(graph: G): Cycles {
  return topology(graph).cycles;
}

export function isCyclic<G extends Walkable>(graph: G): boolean {
  return cycles(graph).hasCycle;
}

export function ranks<G extends Walkable>(graph: G): Map<NodeId, number> {
  const order = toposort(graph, (cycle) => cycle);
  const map = new Map<NodeId, number>();
  for (let i = 0; i < order.length; i++) map.set(order[i]!, i);
  return map;
}
