/**
 * 测试覆盖：weighted helper - 给 EdgeView 缺省 weight 填默认值。
 */
import { describe, expect, it } from 'vitest';

import { weighted, type NodeId } from '../../core';

describe('weighted helper', () => {
  it('为缺省 weight 填默认值', () => {
    const ref = { id: 'e' as never, source: 'a' as NodeId, target: 'b' as NodeId, weight: undefined };
    expect(weighted(ref, 1).weight).toBe(1);
    const ref2 = { ...ref, weight: 5 };
    expect(weighted(ref2, 999).weight).toBe(5);
  });
});
