/**
 * 测试覆盖：Bfs 状态化遍历器。
 */
import { describe, expect, it } from 'vitest';

import { Bfs, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

const diamond = () => buildGraph('d', [
  ['a', 'b'],
  ['a', 'c'],
  ['b', 'd'],
  ['c', 'd'],
]);

const drain = <T>(iterable: Iterable<T>): T[] => [...iterable];

describe('Bfs', () => {
  it('按层次推进', () => {
    const g = diamond();
    expect(drain(Bfs.start(g, id<NodeId>('a')).iterator(g))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('moveTo 重置队列与 visited', () => {
    const g = diamond();
    const bfs = Bfs.start(g, id<NodeId>('a'));
    drain(bfs.iterator(g));
    bfs.moveTo(id<NodeId>('c'));
    expect(drain(bfs.iterator(g))).toEqual(['c', 'd']);
  });
});
