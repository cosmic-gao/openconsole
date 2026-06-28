import type { NodeId } from './brand';

export interface Hierarchy {
  parent(node: NodeId): NodeId | undefined;
  children(node: NodeId): Iterable<NodeId>;
}
