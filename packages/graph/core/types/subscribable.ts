import type { Signal } from '@openconsole/signal';

import type { Edge } from '../classic';
import type { Node } from './port';

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
