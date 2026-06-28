import type { NodeId } from '../types';

export function toIterator(step: () => NodeId | undefined): IterableIterator<NodeId> {
  const result: IterableIterator<NodeId> = {
    [Symbol.iterator]: () => result,
    next: () => {
      const value = step();
      return value === undefined
        ? { value: undefined as unknown as NodeId, done: true }
        : { value, done: false };
    },
  };
  return result;
}
