import type { Signal } from '@openconsole/signal';

import type { Edge } from '../classic';
import type { NodeId } from './brand';
import type { Node } from './port';

export type Control = 'continue' | 'prune' | 'break';

export interface DfsEvent<T = number> {
  readonly kind: 'discover' | 'finish' | 'treeEdge' | 'backEdge' | 'crossEdge';
  readonly node: NodeId;
  readonly target?: NodeId;
  readonly time?: T;
}

export interface Events<N = unknown, E = unknown> {
  nodeAdded: { node: Node<N> };
  nodeDropped: { node: Node<N> };
  nodeUpdated: { node: Node<N>; before: N | undefined; after: N | undefined };
  edgeAdded: { edge: Edge<E> };
  edgeDropped: { edge: Edge<E> };
  edgeUpdated: { edge: Edge<E>; before: E | undefined; after: E | undefined };
}

export interface Subscribable<N = unknown, E = unknown> {
  readonly signal: Signal<Events<N, E>>;
}
