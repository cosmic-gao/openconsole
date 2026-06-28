import type { NodeId } from './brand';

export interface DfsEvent<T = number> {
  readonly kind: 'discover' | 'finish' | 'treeEdge' | 'backEdge' | 'crossEdge';
  readonly node: NodeId;
  readonly target?: NodeId;
  readonly time?: T;
}
