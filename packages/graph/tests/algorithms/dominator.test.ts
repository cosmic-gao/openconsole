/**
 * 测试覆盖：Lengauer-Tarjan 支配树。
 */
import { describe, expect, it } from 'vitest';

import { dominator, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

describe('dominator', () => {
  it('链：每个节点的 idom 是它的前驱', () => {
    const g = buildGraph('chain', [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ]);
    const dom = dominator(g, id<NodeId>('a'));
    expect(dom.get(id<NodeId>('a'))).toBe('a');
    expect(dom.get(id<NodeId>('b'))).toBe('a');
    expect(dom.get(id<NodeId>('c'))).toBe('b');
    expect(dom.get(id<NodeId>('d'))).toBe('c');
  });

  it('菱形 DAG: a → b/c → d；d 的 idom 是 a（两条路径必经 a）', () => {
    const g = buildGraph('dmd', [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
    const dom = dominator(g, id<NodeId>('a'));
    expect(dom.get(id<NodeId>('a'))).toBe('a');
    expect(dom.get(id<NodeId>('b'))).toBe('a');
    expect(dom.get(id<NodeId>('c'))).toBe('a');
    expect(dom.get(id<NodeId>('d'))).toBe('a');
  });

  it('不可达节点不出现在结果中', () => {
    const g = buildGraph('iso', [['a', 'b']], ['island']);
    const dom = dominator(g, id<NodeId>('a'));
    expect(dom.has(id<NodeId>('island'))).toBe(false);
    expect(dom.size).toBe(2);
  });

  it('环：环内非入口节点 idom 应是环上的前驱', () => {
    // entry → a → b → c → a
    const g = buildGraph('loop', [
      ['entry', 'a'],
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
    const dom = dominator(g, id<NodeId>('entry'));
    expect(dom.get(id<NodeId>('entry'))).toBe('entry');
    expect(dom.get(id<NodeId>('a'))).toBe('entry');
    expect(dom.get(id<NodeId>('b'))).toBe('a');
    expect(dom.get(id<NodeId>('c'))).toBe('b');
  });
});
