import type { NodeId } from './brand';

export interface NodeIndexable {
  bound(): number;
  at(index: number): NodeId | undefined;
  indexOf(node: NodeId): number;
}
