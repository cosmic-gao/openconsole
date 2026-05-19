/**
 * 测试覆盖：Topo 拓扑序状态化遍历器（Kahn 算法可暂停版）。
 */
import { describe, expect, it } from 'vitest';

import { Topo, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

const diamond = () => buildGraph('d', [
  ['a', 'b'],
  ['a', 'c'],
  ['b', 'd'],
  ['c', 'd'],
]);

const cycle3 = () => buildGraph('c3', [
  ['x', 'y'],
  ['y', 'z'],
  ['z', 'x'],
]);

const drain = <T>(iterable: Iterable<T>): T[] => [...iterable];

describe('Topo', () => {
  it('drain 后 cycleNodes 为空', () => {
    const g = diamond();
    const topo = Topo.start(g);
    expect(drain(topo.iterator(g))).toEqual(['a', 'b', 'c', 'd']);
    expect(topo.cycleNodes()).toEqual([]);
  });

  it('环图：drain 出 0 个节点，cycleNodes 包含全部环节点', () => {
    const g = cycle3();
    const topo = Topo.start(g);
    expect(drain(topo.iterator(g))).toEqual([]);
    expect(topo.cycleNodes().sort()).toEqual(['x', 'y', 'z']);
  });

  it('collect 一次性 drain + 报告环', () => {
    const result = Topo.start(cycle3()).collect(cycle3());
    expect(result.cycles.hasCycle).toBe(true);
    expect(result.cycles.cycleNodes.length).toBe(3);
  });

  it('Topo 已防孤儿邻居（与 topology 1.1 修复同源）', () => {
    const g = buildGraph('orphan', [], ['a']);
    const real = g.outgoingNeighbors.bind(g);
    (g as unknown as { outgoingNeighbors: typeof g.outgoingNeighbors }).outgoingNeighbors =
      function* (n: NodeId) {
        yield* real(n);
        if (n === 'a') yield id<NodeId>('ghost');
      };
    const topo = Topo.start(g);
    const out: NodeId[] = drain(topo.iterator(g));
    expect(out).toEqual(['a']); // ghost 不应进入
  });
});
