/**
 * 测试覆盖：Csr 编译视图 + 在其上跑现有算法。
 */
import { describe, expect, it } from 'vitest';

import { Csr, csr, scc, toposort, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

const linear = () => buildGraph('lin', [
  ['a', 'b'],
  ['b', 'c'],
  ['c', 'd'],
]);

describe('csr', () => {
  it('compile 返回的实例既是 Walkable 又是 IntoDegree', () => {
    const g = linear();
    const c = csr(g);
    expect(c).toBeInstanceOf(Csr);
    expect(c.nodeCount()).toBe(4);
    expect(c.edgeCount()).toBe(3);
  });

  it('upstream / downstream 等价于原图', () => {
    const g = linear();
    const c = csr(g);
    expect([...c.downstream(id<NodeId>('a'))]).toEqual(['b']);
    expect([...c.downstream(id<NodeId>('b'))]).toEqual(['c']);
    expect([...c.upstream(id<NodeId>('c'))]).toEqual(['b']);
    expect([...c.upstream(id<NodeId>('a'))]).toEqual([]);
  });

  it('inDegree / outDegree O(1) 正确', () => {
    const g = buildGraph('star', [
      ['a', 'b'],
      ['a', 'c'],
      ['a', 'd'],
    ]);
    const c = csr(g);
    expect(c.outDegree(id<NodeId>('a'))).toBe(3);
    expect(c.inDegree(id<NodeId>('a'))).toBe(0);
    expect(c.inDegree(id<NodeId>('b'))).toBe(1);
    expect(c.outDegree(id<NodeId>('b'))).toBe(0);
  });

  it('toposort 在 Csr 上跑得通', () => {
    const c = csr(linear());
    expect(toposort(c)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('scc 在 Csr 上识别环', () => {
    const g = buildGraph('cy', [
      ['x', 'y'],
      ['y', 'z'],
      ['z', 'x'],
    ]);
    const c = csr(g);
    const comps = scc(c).map(s => [...s].sort());
    expect(comps).toEqual([['x', 'y', 'z']]);
  });

  it('weight 回调注入数值权重', () => {
    const g = buildGraph('w', [
      ['a', 'b', 5],
      ['b', 'c', 7],
    ]);
    const c = csr(g, (from, to) => {
      const edge = g.findEdge(from, to);
      return (edge?.weight as number | undefined) ?? 0;
    });
    expect(c.weights).toBeDefined();
    expect(Array.from(c.weights!)).toEqual([5, 7]);
  });

  it('NodeIndexable: at / indexOf / bound', () => {
    const c = csr(linear());
    expect(c.bound()).toBe(4);
    expect(c.at(0)).toBe('a');
    expect(c.indexOf(id<NodeId>('c'))).toBeGreaterThanOrEqual(0);
    expect(c.indexOf(id<NodeId>('nope'))).toBe(-1);
  });
});
