import { describe, expect, it } from "vitest";

import { PairingHeap, type Comparator, type PairingNode } from "../index";

interface Item {
  id: number;
  key: number;
}

/** 全序比较器：key 相同时用 id 兜底，避免并列时对照实现有歧义。 */
const byKey: Comparator<Item> = (a, b) => a.key - b.key || a.id - b.id;
const ascending: Comparator<number> = (a, b) => a - b;

/** 确定性 LCG，保证随机用例可复现。 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function drain<T>(heap: PairingHeap<T>): T[] {
  const result: T[] = [];
  while (!heap.empty()) {
    const value = heap.poll();
    if (value !== undefined) result.push(value);
  }
  return result;
}

describe("PairingHeap · 基础语义", () => {
  it("空堆的 peek / poll 返回 undefined", () => {
    const heap = new PairingHeap<number>(ascending);
    expect(heap.size).toBe(0);
    expect(heap.empty()).toBe(true);
    expect(heap.peek()).toBeUndefined();
    expect(heap.poll()).toBeUndefined();
  });

  it("push 返回句柄，peek 给出最小元素", () => {
    const heap = new PairingHeap<number>(ascending);
    const handle = heap.push(5);
    heap.push(3);
    heap.push(8);

    expect(handle.value).toBe(5);
    expect(heap.peek()).toBe(3);
    expect(heap.size).toBe(3);
  });

  it("poll 按比较器升序产出", () => {
    const heap = new PairingHeap<number>(ascending);
    for (const value of [4, 1, 7, 3, 9, 2]) heap.push(value);
    expect(drain(heap)).toEqual([1, 2, 3, 4, 7, 9]);
    expect(heap.size).toBe(0);
  });

  it("clear 清空全部元素", () => {
    const heap = new PairingHeap<number>(ascending);
    heap.push(1);
    heap.push(2);
    heap.clear();

    expect(heap.size).toBe(0);
    expect(heap.empty()).toBe(true);
    expect(heap.peek()).toBeUndefined();
  });

  it("反转比较器即得最大堆", () => {
    const heap = new PairingHeap<number>((a, b) => b - a);
    for (const value of [4, 1, 7, 3]) heap.push(value);
    expect(drain(heap)).toEqual([7, 4, 3, 1]);
  });
});

describe("PairingHeap · update", () => {
  it("decrease-key 让元素上浮到堆顶", () => {
    const heap = new PairingHeap<Item>(byKey);
    heap.push({ id: 1, key: 10 });
    heap.push({ id: 2, key: 20 });
    const handle = heap.push({ id: 3, key: 30 });

    expect(heap.update(handle, { id: 3, key: 1 })).toBe(true);
    expect(heap.peek()).toEqual({ id: 3, key: 1 });
    expect(handle.value).toEqual({ id: 3, key: 1 });
    expect(drain(heap).map((item) => item.id)).toEqual([3, 1, 2]);
  });

  it("increase-key 后句柄依然有效，且可再次 decrease", () => {
    const heap = new PairingHeap<Item>(byKey);
    const handle = heap.push({ id: 1, key: 1 });
    heap.push({ id: 2, key: 5 });
    heap.push({ id: 3, key: 9 });

    expect(heap.update(handle, { id: 1, key: 100 })).toBe(true);
    expect(heap.peek()).toEqual({ id: 2, key: 5 });
    expect(heap.size).toBe(3);

    expect(heap.update(handle, { id: 1, key: 0 })).toBe(true);
    expect(heap.peek()).toEqual({ id: 1, key: 0 });
    expect(drain(heap).map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("对根节点 increase-key 会正确让位", () => {
    const heap = new PairingHeap<Item>(byKey);
    const root = heap.push({ id: 1, key: 1 });
    heap.push({ id: 2, key: 2 });
    heap.push({ id: 3, key: 3 });

    expect(heap.update(root, { id: 1, key: 50 })).toBe(true);
    expect(drain(heap).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  it("等价更新只改值不动结构", () => {
    const heap = new PairingHeap<Item>(byKey);
    const handle = heap.push({ id: 1, key: 5 });
    heap.push({ id: 2, key: 7 });

    expect(heap.update(handle, { id: 1, key: 5 })).toBe(true);
    expect(handle.value).toEqual({ id: 1, key: 5 });
    expect(heap.size).toBe(2);
    expect(heap.peek()).toEqual({ id: 1, key: 5 });
  });

  it("对已出堆的句柄 update 返回 false 且不破坏堆", () => {
    const heap = new PairingHeap<Item>(byKey);
    const handle = heap.push({ id: 1, key: 1 });
    heap.push({ id: 2, key: 2 });
    heap.push({ id: 3, key: 3 });

    expect(heap.poll()).toEqual({ id: 1, key: 1 });
    expect(heap.update(handle, { id: 1, key: 0 })).toBe(false);
    expect(heap.size).toBe(2);
    expect(drain(heap).map((item) => item.id)).toEqual([2, 3]);
  });
});

describe("PairingHeap · delete", () => {
  it("删除根节点", () => {
    const heap = new PairingHeap<number>(ascending);
    const root = heap.push(1);
    heap.push(2);
    heap.push(3);

    expect(heap.delete(root)).toBe(true);
    expect(heap.size).toBe(2);
    expect(drain(heap)).toEqual([2, 3]);
  });

  it("删除非根节点后堆序不变", () => {
    const heap = new PairingHeap<number>(ascending);
    heap.push(1);
    const middle = heap.push(5);
    heap.push(3);
    heap.push(9);
    heap.push(7);

    expect(heap.delete(middle)).toBe(true);
    expect(heap.size).toBe(4);
    expect(drain(heap)).toEqual([1, 3, 7, 9]);
  });

  it("删除带子树的节点会把子树并回堆", () => {
    const heap = new PairingHeap<number>(ascending);
    // 先 poll 一次触发 collapse，制造出有层级的树形。
    for (const value of [10, 20, 30, 40, 50, 60]) heap.push(value);
    expect(heap.poll()).toBe(10);

    const handles: Array<PairingNode<number>> = [];
    handles.push(heap.push(15));
    handles.push(heap.push(25));
    expect(heap.poll()).toBe(15);

    const target = handles[1];
    expect(target).toBeDefined();
    expect(heap.delete(target as PairingNode<number>)).toBe(true);
    expect(drain(heap)).toEqual([20, 30, 40, 50, 60]);
  });

  it("重复 delete 第二次返回 false", () => {
    const heap = new PairingHeap<number>(ascending);
    heap.push(1);
    const handle = heap.push(2);
    heap.push(3);

    expect(heap.delete(handle)).toBe(true);
    expect(heap.delete(handle)).toBe(false);
    expect(heap.size).toBe(2);
    expect(drain(heap)).toEqual([1, 3]);
  });

  it("删到空堆后 poll 返回 undefined", () => {
    const heap = new PairingHeap<number>(ascending);
    const only = heap.push(1);
    expect(heap.delete(only)).toBe(true);
    expect(heap.empty()).toBe(true);
    expect(heap.poll()).toBeUndefined();
  });
});

describe("PairingHeap · 随机化对照", () => {
  for (const seed of [7, 99, 31337]) {
    it(`seed=${seed}：push / poll / update / delete 与参照实现一致`, () => {
      const random = rng(seed);
      const heap = new PairingHeap<Item>(byKey);
      const live = new Map<number, Item>();
      const handles = new Map<number, PairingNode<Item>>();
      let nextId = 0;

      const pickLive = (): number | undefined => {
        if (live.size === 0) return undefined;
        const ids = [...live.keys()];
        return ids[Math.floor(random() * ids.length)];
      };

      const minimum = (): Item | undefined => {
        let best: Item | undefined;
        for (const item of live.values()) {
          if (best === undefined || byKey(item, best) < 0) best = item;
        }
        return best;
      };

      for (let step = 0; step < 3000; step++) {
        const dice = random();

        if (dice < 0.45) {
          const item: Item = { id: nextId++, key: Math.floor(random() * 1000) };
          handles.set(item.id, heap.push(item));
          live.set(item.id, item);
        } else if (dice < 0.7) {
          const expected = minimum();
          const actual = heap.poll();
          expect(actual).toEqual(expected);
          if (expected !== undefined) {
            live.delete(expected.id);
            handles.delete(expected.id);
          }
        } else if (dice < 0.9) {
          const id = pickLive();
          if (id !== undefined) {
            const handle = handles.get(id);
            expect(handle).toBeDefined();
            const next: Item = { id, key: Math.floor(random() * 1000) };
            expect(heap.update(handle as PairingNode<Item>, next)).toBe(true);
            live.set(id, next);
          }
        } else {
          const id = pickLive();
          if (id !== undefined) {
            const handle = handles.get(id);
            expect(handle).toBeDefined();
            expect(heap.delete(handle as PairingNode<Item>)).toBe(true);
            live.delete(id);
            handles.delete(id);
          }
        }

        expect(heap.size).toBe(live.size);
      }

      const expected = [...live.values()].sort(byKey);
      expect(drain(heap)).toEqual(expected);
    });
  }
});
