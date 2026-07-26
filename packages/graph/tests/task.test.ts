import { describe, expect, it } from "vitest";

import {
  chain,
  closure,
  Incomplete,
  Interrupted,
  nodeId,
  ready,
  scc,
  schedule,
  settle,
  shortestPaths,
  Snapshot,
  transform,
} from "../index";
import { randomGraph } from "./random";

const cost = (weight: number | undefined): number => weight ?? 1;
const sample = (): Snapshot =>
  Snapshot.of(randomGraph(42, { order: 120, density: 3 }), { weight: cost });

describe("分步推进", () => {
  it("逐步跑与一次跑完给出相同结果", () => {
    const snapshot = sample();
    const stepped = scc(snapshot);
    while (stepped.advance(1));

    expect(stepped.result().count).toBe(settle(scc(snapshot)).count);
    expect([...stepped.result().component]).toEqual([
      ...settle(scc(snapshot)).component,
    ]);
  });

  it("任意预算切分都不改变结果", () => {
    const snapshot = sample();
    const source = snapshot.indexOf(nodeId("n0"));
    const reference = settle(shortestPaths(snapshot, source));

    for (const budget of [1, 3, 17, 1000]) {
      const task = shortestPaths(snapshot, source);
      while (task.advance(budget));
      expect([...task.result().distance]).toEqual([...reference.distance]);
    }
  });

  it("progress 单调不减，跑完到 1", () => {
    const task = scc(sample());
    let last = 0;
    while (task.advance(5)) {
      expect(task.progress).toBeGreaterThanOrEqual(last);
      expect(task.progress).toBeLessThanOrEqual(1);
      last = task.progress;
    }
    expect(task.progress).toBe(1);
  });

  it("未跑完时取结果抛 Incomplete，不返回中间态", () => {
    const task = scc(sample());
    task.advance(1);
    expect(task.settled).toBe(false);
    expect(() => task.result()).toThrow(Incomplete);
  });
});

describe("中断与续跑", () => {
  it("中断抛 Interrupted，任务现场保留，可继续跑到正确结果", () => {
    const snapshot = sample();
    const controller = new AbortController();
    const task = scc(snapshot);

    task.advance(4);
    controller.abort();
    expect(() => settle(task, controller.signal)).toThrow(Interrupted);
    expect(task.settled).toBe(false);

    const resumed = settle(task);
    expect(resumed.count).toBe(settle(scc(snapshot)).count);
  });

  it("Interrupted 带上中断时的进度", () => {
    const controller = new AbortController();
    controller.abort();
    try {
      settle(scc(sample()), controller.signal);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(Interrupted);
      expect((error as Interrupted).progress).toBeGreaterThanOrEqual(0);
    }
  });

  it("未中断的 signal 不影响正常跑完", () => {
    const snapshot = sample();
    const controller = new AbortController();
    expect(settle(scc(snapshot), controller.signal).count).toBe(
      settle(scc(snapshot)).count,
    );
  });
});

describe("分帧调度", () => {
  it("schedule 跑出与同步一致的结果并报告进度", async () => {
    const snapshot = sample();
    const seen: number[] = [];
    const result = await schedule(closure(snapshot), {
      budget: 2,
      onProgress: (progress) => seen.push(progress),
    });

    const source = snapshot.indexOf(nodeId("n0"));
    expect(result.from(source).length).toBe(
      settle(closure(snapshot)).from(source).length,
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((value) => value >= 0 && value <= 1)).toBe(true);
    // 最后一帧必须报满，否则进度条永远差一口。
    expect(seen[seen.length - 1]).toBe(1);
  });

  it("schedule 遇到已中断的 signal 立刻抛出", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      schedule(scc(sample()), { signal: controller.signal }),
    ).rejects.toBeInstanceOf(Interrupted);
  });
});

describe("组合器", () => {
  it("ready 是已完成的任务", () => {
    const task = ready(7);
    expect(task.progress).toBe(1);
    expect(settle(task)).toBe(7);
  });

  it("transform 不改变推进节奏，只换结果", () => {
    const snapshot = sample();
    expect(
      settle(transform(scc(snapshot), (partition) => partition.count)),
    ).toBe(settle(scc(snapshot)).count);
  });

  it("chain 串起两个阶段，中断点贯穿全程", () => {
    const snapshot = sample();
    const task = chain(scc(snapshot), (partition) =>
      ready(partition.groups().length),
    );

    let steps = 0;
    while (task.advance(1)) steps++;
    expect(steps).toBeGreaterThan(1);
    expect(task.result()).toBe(settle(scc(snapshot)).count);
  });

  it("多阶段任务的进度跨阶段推进", () => {
    const task = closure(sample());
    const marks: number[] = [];
    while (task.advance(3)) marks.push(task.progress);

    expect(marks.length).toBeGreaterThan(2);
    expect(marks[marks.length - 1]!).toBeGreaterThan(marks[0]!);
  });
});
