/**
 * 测试覆盖：bidijkstra 双向 Dijkstra 单源单汇最短路径。
 */
import { describe, expect, it } from 'vitest';

import { bidijkstra, type NodeId } from '../../core';
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

describe('bidijkstra', () => {
  it('start === end 退化为零距离', () => {
    const result = bidijkstra(linear(), id<NodeId>('a'), id<NodeId>('a'), e => (e.weight as number) ?? 0);
    expect(result).toEqual({ distance: 0, path: ['a'] });
  });

  it('线性图返回正确距离与路径', () => {
    const result = bidijkstra(linear(), id<NodeId>('a'), id<NodeId>('d'), e => (e.weight as number) ?? 0);
    expect(result?.distance).toBe(6);
    expect(result?.path).toEqual(['a', 'b', 'c', 'd']);
  });

  it('菱形图选最短路径', () => {
    const result = bidijkstra(diamond(), id<NodeId>('a'), id<NodeId>('d'), e => (e.weight as number) ?? 0);
    // a→b(1)→d(2)=3 vs a→c(4)→d(1)=5
    expect(result?.distance).toBe(3);
    expect(result?.path).toEqual(['a', 'b', 'd']);
  });

  it('不可达返回 undefined', () => {
    const g = buildGraph('disc', [['a', 'b', 1]], ['island']);
    const result = bidijkstra(g, id<NodeId>('a'), id<NodeId>('island'), e => (e.weight as number) ?? 0);
    expect(result).toBeUndefined();
  });

  it('反向不可达：DAG 中 d → a 不可达', () => {
    const result = bidijkstra(diamond(), id<NodeId>('d'), id<NodeId>('a'), e => (e.weight as number) ?? 0);
    expect(result).toBeUndefined();
  });

  it('拒绝负权边', () => {
    const g = buildGraph('neg', [['a', 'b', -1]]);
    expect(() => bidijkstra(g, id<NodeId>('a'), id<NodeId>('b'), e => e.weight as number)).toThrow(/negative edge cost/);
  });
});
