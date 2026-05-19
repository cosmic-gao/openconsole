/**
 * 测试覆盖：postorder 函数（基于 dfsVisit 事件流的 finish 收集）。
 */
import { describe, expect, it } from 'vitest';

import { postorder, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

const linear = () => buildGraph('lin', [
  ['a', 'b', 1],
  ['b', 'c', 2],
  ['c', 'd', 3],
]);

const diamond = () => buildGraph('dmd', [
  ['a', 'b', 1],
  ['a', 'c', 4],
  ['b', 'd', 2],
  ['c', 'd', 1],
]);

describe('postorder', () => {
  it('finish 顺序：叶子先于内部节点', () => {
    expect(postorder(diamond(), [id<NodeId>('a')])).toEqual(['d', 'b', 'c', 'a']);
  });

  it('未指定起点则全图扫描', () => {
    const order = postorder(linear());
    expect(order).toContain('a');
    expect(order).toContain('d');
    expect(order.length).toBe(4);
  });
});
