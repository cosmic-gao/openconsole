/**
 * 测试覆盖：bridges 与割点（无向语义）。
 */
import { describe, expect, it } from 'vitest';

import { bridges } from '../../core';
import { buildGraph } from '../_fixtures';

const sortPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);
const canon = (b: { from: string; to: string }) => sortPair(String(b.from), String(b.to));

describe('bridges', () => {
  it('单条边图：唯一一条边即桥', () => {
    const g = buildGraph('one', [['a', 'b']]);
    const { bridges: bs, articulations: arts } = bridges(g);
    expect(bs.map(canon)).toEqual([['a', 'b']]);
    expect(arts).toEqual([]);
  });

  it('环图：无桥无割点', () => {
    const g = buildGraph('cy', [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
    const { bridges: bs, articulations: arts } = bridges(g);
    expect(bs).toEqual([]);
    expect(arts).toEqual([]);
  });

  it('两环 + 桥：桥被识别，桥两端是割点', () => {
    // 环1: a-b-a，桥: b-c，环2: c-d-c
    const g = buildGraph('two', [
      ['a', 'b'],
      ['b', 'a'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'c'],
    ]);
    const { bridges: bs, articulations: arts } = bridges(g);
    expect(bs.map(canon)).toEqual([['b', 'c']]);
    expect(arts.sort()).toEqual(['b', 'c']);
  });

  it('链 a-b-c-d：中间两条边是桥；b、c 是割点', () => {
    const g = buildGraph('line', [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ]);
    const { bridges: bs, articulations: arts } = bridges(g);
    expect(bs.map(canon).sort()).toEqual([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ]);
    expect(arts.sort()).toEqual(['b', 'c']);
  });
});
