import type { NodeId } from './brand';

export interface Cycles {
  hasCycle: boolean;
  cycleNodes: NodeId[];
}

export interface Topology {
  order: NodeId[];
  cycles: Cycles;
}
