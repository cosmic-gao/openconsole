import { describe, expect, it } from "vitest";

import {
  astar,
  bellmanFord,
  chain,
  closure,
  floydWarshall,
  Incomplete,
  Interrupted,
  kruskal,
  nodeId,
  ready,
  reduction,
  scc,
  schedule,
  settle,
  shortestPath,
  shortestPaths,
  Snapshot,
  transform,
} from "../../index";
import { line, randomGraph, vertex, wedge, weighted } from "../support";

const sample = (): Snapshot =>
  weighted(randomGraph(42, { order: 120, density: 3 }));

describe("分步推进", () => {
  it("逐步跑与一次跑完给出相同结果", () => {
    const snapshot = sample();
    const stepped = scc(snapshot);
    while (stepped.advance(1));

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

  it("未跑完时取结果抛 Incomplete，不返回中间态", () => {
    const task = scc(sample());
    task.advance(1);
    expect(task.settled).toBe(false);
    expect(() => task.result()).toThrow(Incomplete);
  });
});

describe("进度", () => {
  it("单调不减，跑完为 1", () => {
    const task = scc(sample());
    let last = 0;
    while (task.advance(5)) {
      expect(task.progress).toBeGreaterThanOrEqual(last);
      expect(task.progress).toBeLessThanOrEqual(1);
      last = task.progress;
    }
    expect(task.progress).toBe(1);
  });

  /**
   * 这些都会提前终止：摸到终点、提前收敛、图不连通。各算法自己估的"已处理 / 总数"
   * 到不了分母，归一必须收在 `Stepwise` 里，否则进度条永远差一口。
   */
  const early = [
    ["非连通图上的 shortestPaths", (s: Snapshot) => shortestPaths(s, 0)],
    ["摸到终点即停的 shortestPath", (s: Snapshot) => shortestPath(s, 0, 2)],
    ["提前收敛的 bellmanFord", (s: Snapshot) => bellmanFord(s, 0)],
    ["astar", (s: Snapshot) => astar(s, 0, 2)],
  ] as const;

  it.each(early)("%s 跑完也报 1", (_label, build) => {
    const graph = wedge();
    graph.addNode(vertex("island", 0)); // 谁都到不了，保证提前终止
    const task = build(weighted(graph));

    while (task.advance(1));
    expect(task.settled).toBe(true);
    expect(task.progress).toBe(1);
  });
});

describe("单步粒度", () => {
  /**
   * 分帧的实际粒度由单步大小决定：一步 O(V²) 的话 `schedule` 的预算再小也让不出帧，
   * 而这一点从总耗时上是看不出来的，只能数步数。
   */
  it("floydWarshall 一步是一行而不是一整个中转节点", () => {
    const snapshot = sample();
    const n = snapshot.order;
    const task = floydWarshall(snapshot);

    let steps = 0;
    while (task.advance(1)) steps++;
    expect(steps).toBeGreaterThan(n * (n - 1));
    expect([...task.result().cells]).toEqual([
      ...settle(floydWarshall(snapshot)).cells,
    ]);
  });

  it("bellmanFord 一步是一个节点而不是一整轮松弛", () => {
    const snapshot = sample();
    const task = bellmanFord(snapshot, 0);

    let steps = 0;
    while (task.advance(1)) steps++;
    expect(steps).toBeGreaterThan(snapshot.order);
    expect([...task.result().distance]).toEqual([
      ...settle(bellmanFord(snapshot, 0)).distance,
    ]);
  });

  it("kruskal 建堆按节点计步，不在构造函数里把边排完", () => {
    const snapshot = weighted(line(400));
    const task = kruskal(snapshot);

    let steps = 0;
    while (task.advance(1)) steps++;
    // 排序留在构造函数里的话，推进阶段只有 size 步——那部分既不受预算约束也中断不了。
    expect(steps).toBeGreaterThan(snapshot.size);
    expect(steps).toBeGreaterThan(snapshot.order);
  });

  it("reduction 一步是一条候选边而不是一整个节点", () => {
    // 边远多于节点，因此"按边计步"与"按节点计步"的步数相差一个数量级。
    const snapshot = Snapshot.of(
      randomGraph(9, { order: 60, density: 30, acyclic: true }),
    );
    const task = reduction(snapshot);

    let steps = 0;
    while (task.advance(1)) steps++;
    expect(snapshot.size).toBeGreaterThan(snapshot.order * 10);
    expect(steps).toBeGreaterThan(snapshot.size);
  });

  it("closure 的传播一步是一条邻接槽而不是一整个分量", () => {
    // 密集图缩成寥寥几个分量：按分量计步只剩个位数，按边计步则超过 size。
    const snapshot = Snapshot.of(randomGraph(11, { order: 40, density: 6 }));
    const task = closure(snapshot);

    let steps = 0;
    while (task.advance(1)) steps++;
    expect(steps).toBeGreaterThan(snapshot.size);
  });
});

describe("中断与续跑", () => {
  it("中断抛 Interrupted，现场保留，可继续跑到正确结果", () => {
    const snapshot = sample();
    const controller = new AbortController();
    const task = scc(snapshot);

    task.advance(4);
    controller.abort();
    expect(() => settle(task, controller.signal)).toThrow(Interrupted);
    expect(task.settled).toBe(false);

    expect(settle(task).count).toBe(settle(scc(snapshot)).count);
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
  it("结果与同步一致，且最后一帧报满", () => {
    const snapshot = sample();
    const seen: number[] = [];

    // budget 保证十几帧即可；Windows 定时器 ~15.6ms 一跳，帧数太多会顶到用例超时。
    return schedule(closure(snapshot), {
      budget: 64,
      onProgress: (progress) => seen.push(progress),
    }).then((result) => {
      const source = snapshot.indexOf(nodeId("n0"));
      expect(result.from(source).length).toBe(
        settle(closure(snapshot)).from(source).length,
      );
      expect(seen.every((value) => value >= 0 && value <= 1)).toBe(true);
      expect(seen[seen.length - 1]).toBe(1);
    });
  });

  it("遇到已中断的 signal 立刻抛出", async () => {
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

  it("transform 只换结果，不改推进节奏", () => {
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
