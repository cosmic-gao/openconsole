import type { EdgeId, NodeId } from './brand';

export interface Catalog {
  readonly order: number;
  readonly size: number;
  nodes(): Iterable<NodeId>;
  edges(): Iterable<EdgeId>;
}
