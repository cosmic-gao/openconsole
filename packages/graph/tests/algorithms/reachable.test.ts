/**
 * 测试覆盖：reachable / ancestors / descendants 三个可达性查询。
 */
import { describe, expect, it } from 'vitest';

import { ancestors, descendants, reachable, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

const diamond = () => buildGraph('dmd', [
  ['a', 'b', 1],
  ['a', 'c', 4],
  ['b', 'd', 2],
  ['c', 'd', 1],
]);

describe('reachable / ancestors / descendants', () => {
  it('reachable 顺向 DAG 正确', () => {
    expect(reachable(diamond(), id<NodeId>('a'), id<NodeId>('d'))).toBe(true);
    expect(reachable(diamond(), id<NodeId>('d'), id<NodeId>('a'))).toBe(false);
    expect(reachable(diamond(), id<NodeId>('a'), id<NodeId>('a'))).toBe(true);
  });

  it('ancestors 通过反向视图复用 DFS', () => {
    expect(ancestors(diamond(), id<NodeId>('d')).sort()).toEqual(['a', 'b', 'c']);
    expect(ancestors(diamond(), id<NodeId>('a'))).toEqual([]);
  });

  it('descendants 遵循出边', () => {
    expect(descendants(diamond(), id<NodeId>('a')).sort()).toEqual(['b', 'c', 'd']);
    expect(descendants(diamond(), id<NodeId>('d'))).toEqual([]);
  });
});
