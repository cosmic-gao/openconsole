import type { NodeId } from './brand';
import type { Direction } from './direction';

export interface Neighbors {
  neighbors(node: NodeId, direction?: Direction): Iterable<NodeId>;
  inNeighbors(node: NodeId): Iterable<NodeId>;
  outNeighbors(node: NodeId): Iterable<NodeId>;
}
