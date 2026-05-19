/**
 * 测试覆盖：scc (Tarjan 算法的迭代实现)。
 */
import { describe, expect, it } from 'vitest';

import { scc } from '../../core';
import { buildGraph } from '../_fixtures';

const linear = () => buildGraph('lin', [
  ['a', 'b', 1],
  ['b', 'c', 2],
  ['c', 'd', 3],
]);

const cycle3 = () => buildGraph('cy3', [
  ['x', 'y'],
  ['y', 'z'],
  ['z', 'x'],
]);

describe('scc', () => {
  it('无环图：每个节点自成一个分量', () => {
    const components = scc(linear()).map(c => c.sort());
    expect(components.length).toBe(4);
    expect(components.flat().sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('单环图：所有节点是一个分量', () => {
    const components = scc(cycle3()).map(c => c.sort());
    expect(components).toEqual([['x', 'y', 'z']]);
  });

  it('双环 + 桥：每个环各一个分量', () => {
    const g = buildGraph('two', [
      // 环 1: a → b → a
      ['a', 'b'],
      ['b', 'a'],
      // 桥 b → c
      ['b', 'c'],
      // 环 2: c → d → c
      ['c', 'd'],
      ['d', 'c'],
    ]);
    const sets = scc(g).map(c => c.sort());
    expect(sets.length).toBe(2);
    expect(sets.flat().sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
