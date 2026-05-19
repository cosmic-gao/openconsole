/**
 * 测试覆盖：Reversed 适配器 - 方向翻转、度数互换、与 dfs/toposort 组合。
 */
import { describe, expect, it } from 'vitest';

import { Reversed, reversed, dfs, toposort, type EdgeId, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

const linear = () => buildGraph('lin', [
  ['a', 'b', 1],
  ['b', 'c', 2],
  ['c', 'd', 3],
]);

describe('Reversed', () => {
  it('outgoingNeighbors / incomingNeighbors 互换', () => {
    const r = reversed(linear());
    expect([...r.outgoingNeighbors(id<NodeId>('b'))]).toEqual(['a']);
    expect([...r.incomingNeighbors(id<NodeId>('b'))]).toEqual(['c']);
  });

  it('inDegree / outDegree 互换', () => {
    const r = reversed(linear());
    expect(r.inDegree(id<NodeId>('a'))).toBe(1);  // 反向后 a 有一个入边
    expect(r.outDegree(id<NodeId>('a'))).toBe(0); // 反向后 a 没有出边
    expect(r.inDegree(id<NodeId>('d'))).toBe(0);
    expect(r.outDegree(id<NodeId>('d'))).toBe(1);
  });

  // 1.3 回归：inner 缺 IntoDegree 时通过 neighbors 回退计数
  it('1.3 fix: inner 缺 IntoDegree 时 inDegree/outDegree 通过 neighbors 回退而非返回 0', () => {
    const stub = {
      nodeIds: [id<NodeId>('a'), id<NodeId>('b'), id<NodeId>('c')] as Iterable<NodeId>,
      edgeIds: [] as Iterable<EdgeId>,
      nodeCount: () => 3,
      edgeCount: () => 0,
      neighbors: function* (_n: NodeId): Iterable<NodeId> { /* empty */ },
      incomingNeighbors: function* (n: NodeId): Iterable<NodeId> {
        if (n === 'b') yield id<NodeId>('a');
      },
      outgoingNeighbors: function* (n: NodeId): Iterable<NodeId> {
        if (n === 'a') { yield id<NodeId>('b'); yield id<NodeId>('c'); }
      },
    };
    const r = new Reversed(stub);
    expect(r.inDegree(id<NodeId>('a'))).toBe(2);  // 原图 a 出度 2
    expect(r.outDegree(id<NodeId>('b'))).toBe(1); // 原图 b 入度 1
  });

  it('getEdges 翻转 source / target', () => {
    const r = reversed(linear());
    const refs = [...r.getEdges()].map(ref => `${ref.source}→${ref.target}`).sort();
    expect(refs).toEqual(['b→a', 'c→b', 'd→c']);
  });

  it('与 dfs 组合：得到 ancestors 风格的反向遍历', () => {
    expect([...dfs(reversed(linear()), id<NodeId>('d'))]).toEqual(['d', 'c', 'b', 'a']);
  });

  it('与 toposort 组合：反向 DAG 的拓扑序', () => {
    expect(toposort(reversed(linear()))).toEqual(['d', 'c', 'b', 'a']);
  });

  it('NodeIndexable 透传 inner 的 bound / at / indexOf', () => {
    const inner = linear();
    const r = reversed(inner);
    expect(r.bound()).toBe(inner.bound());
    expect(r.at(0)).toBe(inner.at(0));
    expect(r.indexOf(id<NodeId>('c'))).toBe(inner.indexOf(id<NodeId>('c')));
  });
});
