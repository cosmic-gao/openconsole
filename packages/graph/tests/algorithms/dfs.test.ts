/**
 * 测试覆盖：dfs 生成器函数（与 visitors/Dfs 互补，前者是函数式入口）。
 */
import { describe, expect, it } from 'vitest';

import { dfs, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

const diamond = () => buildGraph('dmd', [
  ['a', 'b', 1],
  ['a', 'c', 4],
  ['b', 'd', 2],
  ['c', 'd', 1],
]);

describe('dfs', () => {
  it('按出邻居顺序压栈', () => {
    expect([...dfs(diamond(), id<NodeId>('a'))]).toEqual(['a', 'b', 'd', 'c']);
  });

  it('从孤立节点出发只产出自身', () => {
    const g = buildGraph('s', [], ['only']);
    expect([...dfs(g, id<NodeId>('only'))]).toEqual(['only']);
  });
});
