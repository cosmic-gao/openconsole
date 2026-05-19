/**
 * 测试覆盖：Socket 兼容性与工厂方法。
 */
import { describe, expect, it } from 'vitest';

import { Socket } from '../../core';

describe('Socket', () => {
  it('内置 Socket 命中同名兼容', () => {
    expect(Socket.number.matches(Socket.number)).toBe(true);
    expect(Socket.string.matches(Socket.string)).toBe(true);
  });

  it('any (`*`) 与任意类型互通', () => {
    expect(Socket.any.matches(Socket.number)).toBe(true);
    expect(Socket.number.matches(Socket.any)).toBe(true);
  });

  it('不同名 Socket 互不兼容', () => {
    expect(Socket.number.matches(Socket.string)).toBe(false);
  });

  it('compatible 列表生效', () => {
    const a = Socket.from('a', [Socket.number]);
    expect(a.matches(Socket.number)).toBe(true);
    // 单向语义：Socket.number 没有 'a' 兼容声明，因此 Socket.number.matches(a) 为 false
    expect(Socket.number.matches(a)).toBe(false);
  });

  it('Socket.from 工厂复用相同字段', () => {
    const s = Socket.from('foo', [Socket.string]);
    expect(s.name).toBe('foo');
    expect(s.compatible).toEqual([Socket.string]);
  });
});
