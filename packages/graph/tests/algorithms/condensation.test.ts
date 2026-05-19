/**
 * 测试覆盖：condensation - 将 SCC 折叠为超节点，输出 DAG 描述。
 */
import { describe, expect, it } from 'vitest';

import { condensation, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

const cycle3 = () => buildGraph('cy3', [
  ['x', 'y'],
  ['y', 'z'],
  ['z', 'x'],
]);

describe('condensation', () => {
  it('SCC 被合并为超节点，得到 DAG 描述', () => {
    const g = buildGraph('cond', [
      ['a', 'b'],
      ['b', 'a'], // a/b 同一 SCC
      ['b', 'c'],
    ]);
    const out = condensation(g);
    expect(out.components.length).toBe(2);
    expect(out.edges).toEqual([
      { from: out.index.get(id<NodeId>('a'))!, to: out.index.get(id<NodeId>('c'))! },
    ]);
  });

  it('单环图 condensation 边为空', () => {
    expect(condensation(cycle3()).edges).toEqual([]);
  });
});
