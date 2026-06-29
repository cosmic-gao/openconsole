import type { Catalog, EdgeView, IntoDegree, IntoEdges, NodeId, NodeIndexable } from '../types';

export const EMPTY: Iterable<never> = {
  *[Symbol.iterator]() {},
};

export function flip<E>(view: EdgeView<E>): EdgeView<E> {
  return { id: view.id, source: view.target, target: view.source, weight: view.weight };
}

export function hasEdges(inner: Partial<IntoEdges>): boolean {
  return typeof inner.edgeViews === 'function';
}

export function hasDegree(inner: Partial<IntoDegree>): boolean {
  return typeof inner.inDegree === 'function' && typeof inner.outDegree === 'function';
}

export function hasIndex(inner: Partial<NodeIndexable>): boolean {
  return (
    typeof inner.bound === 'function' &&
    typeof inner.at === 'function' &&
    typeof inner.indexOf === 'function'
  );
}

export function nodeAt(inner: Catalog, index: number): NodeId | undefined {
  let i = 0;
  for (const id of inner.nodes()) {
    if (i === index) return id;
    i++;
  }
  return undefined;
}

export function nodeIndex(inner: Catalog, node: NodeId): number {
  let i = 0;
  for (const id of inner.nodes()) {
    if (id === node) return i;
    i++;
  }
  return -1;
}
