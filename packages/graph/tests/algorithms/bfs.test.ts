/**
 * 测试覆盖：bfs 生成器函数。
 */
import { describe, expect, it } from 'vitest';

import { bfs, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

const diamond = () => buildGraph('dmd', [
  ['a', 'b', 1],
  ['a', 'c', 4],
  ['b', 'd', 2],
  ['c', 'd', 1],
]);

describe('bfs', () => {
  it('按层次推进', () => {
    expect([...bfs(diamond(), id<NodeId>('a'))]).toEqual(['a', 'b', 'c', 'd']);
  });

  it('从孤立节点出发只产出自身', () => {
    const g = buildGraph('s', [], ['only']);
    expect([...bfs(g, id<NodeId>('only'))]).toEqual(['only']);
  });
});
