/**
 * 测试覆盖：neighborhood - 一次扫描同步推导 predecessors / successors。
 */
import { describe, expect, it } from 'vitest';

import { neighborhood, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

const diamond = () => buildGraph('dmd', [
  ['a', 'b', 1],
  ['a', 'c', 4],
  ['b', 'd', 2],
  ['c', 'd', 1],
]);

describe('neighborhood', () => {
  it('一次扫描即可同时得到 predecessors / successors', () => {
    const map = neighborhood(diamond());
    expect(map.get(id<NodeId>('d'))?.predecessors.sort()).toEqual(['b', 'c']);
    expect(map.get(id<NodeId>('a'))?.successors.sort()).toEqual(['b', 'c']);
    expect(map.get(id<NodeId>('a'))?.predecessors).toEqual([]);
  });
});
