/**
 * 测试覆盖：BinaryHeap 通用二叉最小堆。
 */
import { describe, expect, it } from 'vitest';

import { BinaryHeap } from '../../core/internal/heap';

describe('BinaryHeap', () => {
  it('空堆 isEmpty + peek + pop', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    expect(h.isEmpty).toBe(true);
    expect(h.size).toBe(0);
    expect(h.peek()).toBeUndefined();
    expect(h.pop()).toBeUndefined();
  });

  it('单元素 push/peek/pop', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    h.push(5);
    expect(h.size).toBe(1);
    expect(h.peek()).toBe(5);
    expect(h.pop()).toBe(5);
    expect(h.isEmpty).toBe(true);
  });

  it('多元素按升序弹出（最小堆）', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5].forEach(v => h.push(v));
    const out: number[] = [];
    while (!h.isEmpty) out.push(h.pop()!);
    expect(out).toEqual([1, 1, 2, 3, 3, 4, 5, 5, 5, 6, 9]);
  });

  it('自定义比较：最大堆', () => {
    const h = new BinaryHeap<number>((a, b) => b - a);
    [3, 1, 4, 1, 5, 9, 2, 6].forEach(v => h.push(v));
    const out: number[] = [];
    while (!h.isEmpty) out.push(h.pop()!);
    expect(out).toEqual([9, 6, 5, 4, 3, 2, 1, 1]);
  });

  it('对象堆：按字段排序', () => {
    interface Entry { node: string; dist: number }
    const h = new BinaryHeap<Entry>((a, b) => a.dist - b.dist);
    h.push({ node: 'b', dist: 5 });
    h.push({ node: 'a', dist: 1 });
    h.push({ node: 'c', dist: 3 });
    expect(h.pop()?.node).toBe('a');
    expect(h.pop()?.node).toBe('c');
    expect(h.pop()?.node).toBe('b');
  });

  it('交错 push/pop 保持堆性质', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    h.push(5);
    h.push(2);
    expect(h.pop()).toBe(2);
    h.push(1);
    h.push(3);
    expect(h.pop()).toBe(1);
    expect(h.pop()).toBe(3);
    expect(h.pop()).toBe(5);
  });
});
