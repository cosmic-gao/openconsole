/**
 * 测试覆盖：A* 启发式最短路径。
 */
import { describe, expect, it } from 'vitest';

import { astar, type NodeId } from '../../core';
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

describe('astar', () => {
  it('start === end 退化为零距离', () => {
    const r = astar(linear(), id<NodeId>('a'), id<NodeId>('a'), e => (e.weight as number) ?? 0);
    expect(r).toEqual({ distance: 0, path: ['a'] });
  });

  it('启发恒为 0 时退化为 Dijkstra', () => {
    const r = astar(linear(), id<NodeId>('a'), id<NodeId>('d'), e => (e.weight as number) ?? 0);
    expect(r?.distance).toBe(6);
    expect(r?.path).toEqual(['a', 'b', 'c', 'd']);
  });

  it('菱形图选最短路径', () => {
    const r = astar(diamond(), id<NodeId>('a'), id<NodeId>('d'), e => (e.weight as number) ?? 0);
    expect(r?.distance).toBe(3);
    expect(r?.path).toEqual(['a', 'b', 'd']);
  });

  it('admissible heuristic 不影响最优性', () => {
    // 给一个"乐观但不超估真实距离"的启发：固定 1 < 真实最小距离
    const r = astar(
      diamond(),
      id<NodeId>('a'),
      id<NodeId>('d'),
      e => (e.weight as number) ?? 0,
      () => 1,
    );
    expect(r?.distance).toBe(3);
    expect(r?.path).toEqual(['a', 'b', 'd']);
  });

  it('不可达返回 undefined', () => {
    const g = buildGraph('disc', [['a', 'b', 1]], ['island']);
    const r = astar(g, id<NodeId>('a'), id<NodeId>('island'), e => (e.weight as number) ?? 0);
    expect(r).toBeUndefined();
  });

  it('拒绝负权边', () => {
    const g = buildGraph('neg', [['a', 'b', -1]]);
    expect(() => astar(g, id<NodeId>('a'), id<NodeId>('b'), e => e.weight as number))
      .toThrow(/negative edge cost/);
  });
});
