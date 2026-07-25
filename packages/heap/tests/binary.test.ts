import { describe, expect, it } from "vitest";

import { BinaryHeap, type Comparator } from "../index";

const ascending: Comparator<number> = (a, b) => a - b;
const descending: Comparator<number> = (a, b) => b - a;

/** 确定性 LCG，保证随机用例可复现。 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** 校验数组仍满足最小堆性质：每个父节点不大于其子节点。 */
function intact<T>(heap: BinaryHeap<T>, compare: Comparator<T>): boolean {
  const items = heap.snapshot();
  for (let i = 1; i < items.length; i++) {
    const parent = items[(i - 1) >> 1];
    const child = items[i];
    if (parent === undefined || child === undefined) return false;
    if (compare(parent, child) > 0) return false;
  }
  return true;
}

/** 依次 poll 干净，得到全序序列。 */
function drain<T>(heap: BinaryHeap<T>): T[] {
  const result: T[] = [];
  while (!heap.empty()) {
    const value = heap.poll();
    if (value !== undefined) result.push(value);
  }
  return result;
}

describe("BinaryHeap · 基础语义", () => {
  it("空堆的 peek / poll 返回 undefined", () => {
    const heap = new BinaryHeap<number>(ascending);
    expect(heap.size).toBe(0);
    expect(heap.empty()).toBe(true);
    expect(heap.peek()).toBeUndefined();
    expect(heap.poll()).toBeUndefined();
  });

  it("push 返回元素个数，peek 给出最小元素", () => {
    const heap = new BinaryHeap<number>(ascending);
    expect(heap.push(5)).toBe(1);
    expect(heap.push(3)).toBe(2);
    expect(heap.push(8)).toBe(3);
    expect(heap.peek()).toBe(3);
    expect(heap.size).toBe(3);
  });

  it("push 零个元素是空操作", () => {
    const heap = new BinaryHeap<number>(ascending);
    heap.push(1);
    expect(heap.push()).toBe(1);
    expect(heap.size).toBe(1);
  });

  it("poll 按比较器升序产出", () => {
    const heap = new BinaryHeap<number>(ascending);
    heap.push(4, 1, 7, 3, 9, 2);
    expect(drain(heap)).toEqual([1, 2, 3, 4, 7, 9]);
    expect(heap.size).toBe(0);
  });

  it("批量 push 走 Floyd 建堆，结果与逐个 push 一致", () => {
    const values = [9, 4, 7, 1, 8, 2, 6, 3, 5];
    const batch = new BinaryHeap<number>(ascending);
    batch.push(...values);

    const single = new BinaryHeap<number>(ascending);
    for (const value of values) single.push(value);

    expect(intact(batch, ascending)).toBe(true);
    expect(drain(batch)).toEqual(drain(single));
  });

  it("批量 push 可以追加到已有元素之上", () => {
    const heap = new BinaryHeap<number>(ascending);
    heap.push(10, 20);
    heap.push(1, 15, 5);
    expect(intact(heap, ascending)).toBe(true);
    expect(drain(heap)).toEqual([1, 5, 10, 15, 20]);
  });

  it("clear 清空全部元素", () => {
    const heap = new BinaryHeap<number>(ascending);
    heap.push(1, 2, 3);
    heap.clear();
    expect(heap.size).toBe(0);
    expect(heap.empty()).toBe(true);
    expect(heap.peek()).toBeUndefined();
    expect(heap.snapshot()).toEqual([]);
  });

  it("反转比较器即得最大堆", () => {
    const heap = new BinaryHeap<number>(descending);
    heap.push(4, 1, 7, 3);
    expect(heap.peek()).toBe(7);
    expect(drain(heap)).toEqual([7, 4, 3, 1]);
  });

  it("支持按字段比较的对象元素", () => {
    interface Task {
      name: string;
      cost: number;
    }
    const heap = new BinaryHeap<Task>((a, b) => a.cost - b.cost);
    heap.push({ name: "c", cost: 30 }, { name: "a", cost: 10 });
    heap.push({ name: "b", cost: 20 });
    expect(drain(heap).map((task) => task.name)).toEqual(["a", "b", "c"]);
  });
});

describe("BinaryHeap · replace", () => {
  it("非空堆：弹出旧堆顶并压入新值", () => {
    const heap = new BinaryHeap<number>(ascending);
    heap.push(2, 5, 8);
    expect(heap.replace(6)).toBe(2);
    expect(intact(heap, ascending)).toBe(true);
    expect(drain(heap)).toEqual([5, 6, 8]);
  });

  it("空堆：直接入堆并返回 undefined", () => {
    const heap = new BinaryHeap<number>(ascending);
    expect(heap.replace(1)).toBeUndefined();
    expect(heap.size).toBe(1);
    expect(heap.peek()).toBe(1);
  });

  it("新值小于全部元素时仍保持堆序", () => {
    const heap = new BinaryHeap<number>(ascending);
    heap.push(5, 6, 7);
    expect(heap.replace(1)).toBe(5);
    expect(heap.peek()).toBe(1);
    expect(intact(heap, ascending)).toBe(true);
  });
});

describe("BinaryHeap · delete / has", () => {
  it("删除存在的元素并维持堆序", () => {
    const heap = new BinaryHeap<number>(ascending);
    heap.push(1, 3, 5, 7, 9, 11);
    expect(heap.delete(7)).toBe(true);
    expect(heap.has(7)).toBe(false);
    expect(intact(heap, ascending)).toBe(true);
    expect(drain(heap)).toEqual([1, 3, 5, 9, 11]);
  });

  it("删除不存在的元素返回 false 且不改动堆", () => {
    const heap = new BinaryHeap<number>(ascending);
    heap.push(1, 2, 3);
    expect(heap.delete(99)).toBe(false);
    expect(heap.size).toBe(3);
  });

  it("删除堆顶等价于 poll", () => {
    const heap = new BinaryHeap<number>(ascending);
    heap.push(4, 2, 6);
    expect(heap.delete(2)).toBe(true);
    expect(heap.peek()).toBe(4);
  });

  it("删除末位元素（无需筛选）", () => {
    const heap = new BinaryHeap<number>(ascending);
    heap.push(1, 2, 3);
    const last = heap.snapshot()[2];
    expect(last).toBeDefined();
    expect(heap.delete(last as number)).toBe(true);
    expect(heap.size).toBe(2);
    expect(intact(heap, ascending)).toBe(true);
  });

  it("补位元素需要上浮时也能正确处理", () => {
    // 构造出「末尾元素比被删位置的父节点更小」的形状，迫使 _removeAt 走 siftUp。
    const heap = new BinaryHeap<number>(ascending);
    heap.push(1, 50, 2, 60, 70, 3, 4);
    expect(heap.delete(70)).toBe(true);
    expect(heap.delete(60)).toBe(true);
    expect(intact(heap, ascending)).toBe(true);
    expect(drain(heap)).toEqual([1, 2, 3, 4, 50]);
  });

  it("重复元素：每次 delete 只移除一份，其余仍可被找到", () => {
    const heap = new BinaryHeap<number>(ascending);
    heap.push(5, 5, 5, 1);

    expect(heap.delete(5)).toBe(true);
    expect(heap.has(5)).toBe(true);
    expect(heap.size).toBe(3);

    expect(heap.delete(5)).toBe(true);
    expect(heap.has(5)).toBe(true);

    expect(heap.delete(5)).toBe(true);
    expect(heap.has(5)).toBe(false);
    expect(drain(heap)).toEqual([1]);
  });
});

describe("BinaryHeap · snapshot", () => {
  it("返回拷贝，外部修改不影响内部", () => {
    const heap = new BinaryHeap<number>(ascending);
    heap.push(1, 2, 3);

    const snapshot = heap.snapshot();
    expect(snapshot).toHaveLength(3);

    // @ts-expect-error 只读数组不暴露 push
    snapshot.push(4);

    expect(heap.size).toBe(3);
  });
});

describe("BinaryHeap · 随机化对照", () => {
  for (const seed of [1, 42, 2024]) {
    it(`seed=${seed}：与排序参照实现一致`, () => {
      const random = rng(seed);
      const heap = new BinaryHeap<number>(ascending);
      const reference: number[] = [];

      for (let step = 0; step < 2000; step++) {
        const dice = random();

        if (dice < 0.5) {
          const value = Math.floor(random() * 1000);
          heap.push(value);
          reference.push(value);
        } else if (dice < 0.8) {
          reference.sort(ascending);
          expect(heap.poll()).toBe(reference.shift());
        } else if (reference.length > 0) {
          const index = Math.floor(random() * reference.length);
          const victim = reference[index];
          expect(victim).toBeDefined();
          expect(heap.delete(victim as number)).toBe(true);
          reference.splice(index, 1);
        }

        expect(heap.size).toBe(reference.length);
      }

      expect(intact(heap, ascending)).toBe(true);
      expect(drain(heap)).toEqual([...reference].sort(ascending));
    });
  }
});
