import type { EdgeView } from '../types';

export function weighted<E, W>(edge: EdgeView<E>, defaultWeight: W): EdgeView<E | W> {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    weight: edge.weight ?? defaultWeight,
  };
}
