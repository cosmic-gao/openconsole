/**
 * 测试覆盖：degrees / sources / sinks / isolated。
 */
import { describe, expect, it } from 'vitest';

import { degrees, isolated, sinks, sources, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

const diamond = () => buildGraph('dmd', [
  ['a', 'b', 1],
  ['a', 'c', 4],
  ['b', 'd', 2],
  ['c', 'd', 1],
]);

describe('degrees / sources / sinks / isolated', () => {
  it('degrees 正确计入/出度', () => {
    const d = degrees(diamond());
    expect(d.get(id<NodeId>('a'))).toEqual({ inDegree: 0, outDegree: 2 });
    expect(d.get(id<NodeId>('d'))).toEqual({ inDegree: 2, outDegree: 0 });
    expect(d.get(id<NodeId>('b'))).toEqual({ inDegree: 1, outDegree: 1 });
  });

  it('sources / sinks / isolated 在算法层正确返回 NodeId[]', () => {
    const g = buildGraph('mixed', [['a', 'b']], ['lonely']);
    expect(sources(g).sort()).toEqual(['a', 'lonely']);
    expect(sinks(g).sort()).toEqual(['b', 'lonely']);
    expect(isolated(g)).toEqual(['lonely']);
  });
});
