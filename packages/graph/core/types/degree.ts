import type { NodeId } from './brand';

export interface Degree {
  inDegree: number;
  outDegree: number;
}

export interface IntoDegree {
  inDegree(node: NodeId): number;
  outDegree(node: NodeId): number;
}
