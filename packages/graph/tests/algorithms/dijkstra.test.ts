/**
 * 测试覆盖：dijkstra 单源最短路径（非负权重）。
 */
import { describe, expect, it } from 'vitest';

import { dijkstra, type NodeId } from '../../core';
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

describe('dijkstra', () => {
  it('线性图返回累计距离', () => {
    const dist = dijkstra(linear(), id<NodeId>('a'), undefined, e => (e.weight as number) ?? 0);
    expect(dist.get(id<NodeId>('a'))).toBe(0);
    expect(dist.get(id<NodeId>('b'))).toBe(1);
    expect(dist.get(id<NodeId>('c'))).toBe(3);
    expect(dist.get(id<NodeId>('d'))).toBe(6);
  });

  it('菱形图选最短路径', () => {
    const dist = dijkstra(diamond(), id<NodeId>('a'), undefined, e => (e.weight as number) ?? 0);
    // a→b(1)→d(2)=3 vs a→c(4)→d(1)=5
    expect(dist.get(id<NodeId>('d'))).toBe(3);
  });

  it('指定 end 时提前终止仍返回正确距离', () => {
    const dist = dijkstra(diamond(), id<NodeId>('a'), id<NodeId>('d'), e => (e.weight as number) ?? 0);
    expect(dist.get(id<NodeId>('d'))).toBe(3);
  });

  it('不可达节点不在 distances 中', () => {
    const g = buildGraph('disc', [['a', 'b', 1]], ['island']);
    const dist = dijkstra(g, id<NodeId>('a'), undefined, e => (e.weight as number) ?? 0);
    expect(dist.has(id<NodeId>('island'))).toBe(false);
  });
});
