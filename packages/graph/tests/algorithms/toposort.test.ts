/**
 * 测试覆盖：toposort / topology / cycles / isCyclic / ranks 与 CycleError。
 */
import { describe, expect, it } from 'vitest';

import {
  CycleError,
  cycles,
  isCyclic,
  ranks,
  toposort,
  topology,
  type NodeId,
} from '../../core';
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

const cycle3 = () => buildGraph('cy3', [
  ['x', 'y'],
  ['y', 'z'],
  ['z', 'x'],
]);

describe('toposort', () => {
  it('线性 DAG 返回稳定顺序', () => {
    expect(toposort(linear())).toEqual(['a', 'b', 'c', 'd']);
  });

  it('菱形 DAG: a 在 b/c 前，d 在最后', () => {
    const order = toposort(diamond());
    expect(order[0]).toBe(id<NodeId>('a'));
    expect(order[order.length - 1]).toBe(id<NodeId>('d'));
    expect(order.indexOf(id<NodeId>('b'))).toBeLessThan(order.indexOf(id<NodeId>('d')));
    expect(order.indexOf(id<NodeId>('c'))).toBeLessThan(order.indexOf(id<NodeId>('d')));
  });

  it('环图默认抛出 CycleError', () => {
    expect(() => toposort(cycle3())).toThrowError(CycleError);
    try {
      toposort(cycle3());
    } catch (e) {
      expect(e).toBeInstanceOf(CycleError);
      expect((e as CycleError).cycleNodes.sort()).toEqual(['x', 'y', 'z']);
    }
  });

  it('自定义 onCycle 可压制错误并附加环上节点', () => {
    const order = toposort(cycle3(), (cycle) => cycle);
    expect(order.sort()).toEqual(['x', 'y', 'z']);
  });

  // 1.1 回归：topology 不应把 outgoingNeighbors 返回的孤儿节点纳入 order
  it('1.1 fix: outgoingNeighbors 返回的孤儿节点不会污染 order', () => {
    const g = buildGraph('orphan', [], ['a', 'b']);
    const real = g.outgoingNeighbors.bind(g);
    (g as unknown as { outgoingNeighbors: typeof g.outgoingNeighbors }).outgoingNeighbors =
      function* (n: NodeId) {
        yield* real(n);
        if (n === 'a') yield id<NodeId>('ghost');
      };
    const result = topology(g);
    expect(result.order.includes(id<NodeId>('ghost'))).toBe(false);
    expect(result.order.sort()).toEqual(['a', 'b']);
    expect(result.cycles.hasCycle).toBe(false);
  });
});

describe('cycles / isCyclic', () => {
  it('DAG 无环', () => {
    expect(cycles(linear()).hasCycle).toBe(false);
    expect(isCyclic(linear())).toBe(false);
  });

  it('环图返回环上节点', () => {
    const c = cycles(cycle3());
    expect(c.hasCycle).toBe(true);
    expect(c.cycleNodes.sort()).toEqual(['x', 'y', 'z']);
    expect(isCyclic(cycle3())).toBe(true);
  });
});

describe('ranks', () => {
  it('返回 nodeId → 拓扑序中位置', () => {
    const r = ranks(linear());
    expect(r.get(id<NodeId>('a'))).toBe(0);
    expect(r.get(id<NodeId>('d'))).toBe(3);
  });
});
