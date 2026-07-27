import { describe, expect, it } from "vitest";

import {
  CEILING,
  closure,
  floydWarshall,
  Oversized,
  reduction,
  settle,
  Snapshot,
} from "../../index";
import { randomGraph, weighted } from "../support";

/**
 * 稠密结构的规模闸门。
 *
 * `floydWarshall` 的矩阵是 8·V²、`closure` 的位图是 count×⌈V/32⌉ 字——两者都随 V 平方增长，
 * 却都曾是一次不加检查的直接申请：V=10000 的矩阵就是 763MB，V=100000 的位图是 1.2GB。
 * 静默的巨额分配轻则拖垮进程、重则被 OOM 杀掉，而调用方通常只是没意识到图有多大。
 */
describe("稠密分配的规模闸门", () => {
  const sample = (): Snapshot =>
    weighted(randomGraph(4, { order: 120, density: 2, acyclic: true }));

  it("floydWarshall 超限时构造即抛，不会先把内存吃掉", () => {
    const snapshot = sample();
    const needed = 8 * snapshot.order * snapshot.order;

    expect(() => floydWarshall(snapshot, { limit: needed - 1 })).toThrow(
      Oversized,
    );
    expect(() =>
      settle(floydWarshall(snapshot, { limit: needed })),
    ).not.toThrow();
  });

  it("closure 在分量数已知之后才判定，因此错误落在推进途中", () => {
    const snapshot = sample();
    // 构造不碰内存，闸门要等 scc 跑完。
    const task = closure(snapshot, { limit: 1 });
    expect(() => settle(task)).toThrow(Oversized);
  });

  it("reduction 把 limit 透传给它底下的 closure", () => {
    expect(() => settle(reduction(sample(), { limit: 1 }))).toThrow(Oversized);
  });

  it("错误带上申请量与上限，便于判断是抬闸门还是换算法", () => {
    const snapshot = sample();
    try {
      settle(floydWarshall(snapshot, { limit: 1024 }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(Oversized);
      const oversized = error as Oversized;
      expect(oversized.code).toBe("oversized");
      expect(oversized.bytes).toBe(8 * snapshot.order * snapshot.order);
      expect(oversized.limit).toBe(1024);
      expect(oversized.message).toMatch(/floydWarshall on V=120/);
    }
  });

  it("默认上限足够跑常规规模，不误伤", () => {
    const snapshot = sample();
    expect(8 * snapshot.order * snapshot.order).toBeLessThan(CEILING);
    expect(() => settle(floydWarshall(snapshot))).not.toThrow();
    expect(() => settle(closure(snapshot))).not.toThrow();
  });
});
