/**
 * 测试覆盖：kosaraju 算法及与 scc 的等价性。
 */
import { describe, expect, it } from 'vitest';

import { kosaraju, scc, type NodeId } from '../../core';
import { buildGraph } from '../_fixtures';

describe('kosaraju', () => {
  it('kosaraju 与 scc 在划分上一致', () => {
    const norm = (cs: NodeId[][]) => cs.map(c => [...c].sort()).map(c => c.join(',')).sort();
    const g = buildGraph('mix', [
      ['a', 'b'],
      ['b', 'a'],
      ['b', 'c'],
    ]);
    expect(norm(scc(g))).toEqual(norm(kosaraju(g)));
  });
});
