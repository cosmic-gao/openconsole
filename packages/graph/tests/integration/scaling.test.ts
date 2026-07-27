import { describe, expect, it } from "vitest";

import {
  nodeId,
  settle,
  shortestPaths,
  Snapshot,
  type Graph,
} from "../../index";
import { cost, fastest, hub, randomGraph, vertex, weighted } from "../support";

/**
 * 复杂度闸门。
 *
 * 断言的是**同一进程里规模翻倍时的耗时比**，不是绝对毫秒数——绝对值在同一台机器上前后
 * 两轮就能差 2–4 倍（后台扫描、降频、GC 压力），拿它当闸门只会天天误报。而"规模翻 4 倍
 * 耗时涨了 16 倍"这种信号无论机器快慢都成立，要挡的正是这一类掉档：某个 O(n) 变回 O(n²)。
 *
 * 阈值留了很宽的余量：线性期望 4×，判死线放在 9×，中间那段留给常数项与 GC。
 */
const LIMIT = 9;

const mesh = (order: number): Graph<number, number> =>
  randomGraph(1, { order, density: 4, acyclic: true });

describe("删边路径不随扇出平方退化", () => {
  /**
   * 四条路径共用同一个 O(1) 摘链原语。它若退回"在邻接表上 indexOf"，每条边都要在正在
   * 收缩的列表上线性查找一遍，四条一起变成 O(deg²)。
   *
   * 这里不用规模比：实测这四条即便一切正常，4 倍规模也会涨 3.6×–9.1×（缓存与 GC 让线性
   * 操作的常数随数据量一起长），而平方是 16×——两条带子几乎贴在一起，卡 9× 只会天天误报。
   * 改用同机同轮的**建图**当标尺：建图是 O(E) 且分配远比摘链重，排干一张图理应明显更便宜。
   * 实测排干只占建图的 15%–60%；真退化成平方则要几百倍于此，判据两侧各有一个数量级的余量。
   */
  type Drain = (graph: Graph<number, number>) => () => void;

  const drains: ReadonlyArray<readonly [string, Drain]> = [
    ["dropNode", (graph) => () => void graph.dropNode(nodeId("h"))],
    [
      "逐条 disconnect",
      (graph) => {
        // 物化 id 数组是一次性的 O(E) 分配，卡的是 disconnect 本身，不算在内。
        const edges = graph.edges();
        return () => {
          for (const edge of edges) graph.disconnect(edge);
        };
      },
    ],
    ["clearEdges", (graph) => () => graph.clearEdges()],
    [
      "reshape 断全部连线",
      (graph) => () =>
        void graph.reshape(nodeId("h"), { inputs: {}, outputs: {} }),
    ],
  ];

  it.each(drains)("%s", (_label, prepare) => {
    // 排水是破坏性的，一张图只能量一次，因此每轮都新建，取最快的一轮。
    const measure = (fan: number): { build: number; drain: number } => {
      let build = Infinity;
      let drain = Infinity;
      for (let round = 0; round < 3; round++) {
        const raised = performance.now();
        const graph = hub(fan);
        build = Math.min(build, performance.now() - raised);

        const work = prepare(graph);
        const started = performance.now();
        work();
        drain = Math.min(drain, performance.now() - started);
        expect(graph.size).toBe(0);
      }
      return { build, drain };
    };

    const large = measure(40_000);
    expect(large.drain).toBeLessThan(large.build);
  });
});

describe("快照编译", () => {
  it("随边数线性", () => {
    const small = mesh(4000);
    const large = mesh(16_000);

    const one = fastest(3, () => void weighted(small));
    const four = fastest(3, () => void weighted(large));
    expect(four).toBeLessThan(Math.max(one, 1) * LIMIT);
  });

  it("增量重编译只随改动量走，且快过全量", () => {
    const reweigh = (graph: Graph<number, number>): (() => void) => {
      const base = weighted(graph);
      const edge = graph.edges()[0]!;
      let tick = 0;
      return () => {
        graph.setEdgeWeight(edge, (tick++ % 9) + 1);
        Snapshot.of(graph, { weight: cost, reuse: base });
      };
    };

    const small = mesh(4000);
    const large = mesh(16_000);
    const one = fastest(5, reweigh(small));
    const four = fastest(5, reweigh(large));

    // 仍是 O(E)（每条边的权重都要重算），但常数远小于全量编译。
    expect(four).toBeLessThan(Math.max(one, 1) * LIMIT);
    expect(fastest(5, reweigh(large))).toBeLessThan(
      fastest(3, () => void weighted(large)),
    );
  });
});

describe("边权画像只算一次", () => {
  /**
   * 节点数固定（每次调用的 O(V) 分配一样多），只把**无关的**边数放大几十倍；起点仍只够到
   * 两个节点。若每次调用都要重扫一遍全部边权（挑优先队列时的那一遍），耗时就会跟着涨。
   * 反向那一轮每次都新建 `reverse()`：画像若以结构对象为键，新对象永远命中不了缓存。
   */
  const views = [
    ["正向", (snapshot: Snapshot): Snapshot => snapshot],
    ["反向", (snapshot: Snapshot): Snapshot => snapshot.reverse()],
  ] as const;

  it.each(views)("%s快照上的单源最短路不随无关边数增长", (_label, view) => {
    const build = (density: number): Snapshot => {
      const graph = randomGraph(1, { order: 500, density, acyclic: true });
      for (const name of ["s", "a", "b"]) graph.addNode(vertex(name, 0));
      graph.connect([nodeId("s"), "out"], [nodeId("a"), "in"], { weight: 1 });
      graph.connect([nodeId("a"), "out"], [nodeId("b"), "in"], { weight: 1 });
      return weighted(graph);
    };

    const measure = (snapshot: Snapshot): number => {
      const s = snapshot.indexOf(nodeId("s"));
      settle(shortestPaths(view(snapshot), s));
      return fastest(3, () => {
        for (let i = 0; i < 50; i++) settle(shortestPaths(view(snapshot), s));
      });
    };

    const lean = build(1);
    const bulky = build(200);
    expect(bulky.size).toBeGreaterThan(lean.size * 20);
    expect(measure(bulky)).toBeLessThan(Math.max(measure(lean), 0.2) * 3);
  });
});

// `diff` 的“不为每个节点付固定重成本”钉在 `tests/unit/serialize.test.ts` 上：那里数的是
// `JSON.stringify` 的调用次数，精确且与机器无关。曾想用“diff 耗时 / pack 耗时”来卡，但旧
// 写法**也是** O(V)、只是常数大几倍，实测两者比值 6.6× 与 4.2× 和跨轮噪声重叠，分不开。

// 单步粒度的闸门钉在 `tests/task.test.ts` 上：那里数的是推进步数，精确且不受机器快慢
// 影响。曾用"扇出翻 4 倍、最慢单步不许涨过 9 倍"来卡 `reduction`，但 JIT 预热会把小规模
// 那一轮的耗时抬高，比值被压到阈值之内——按边计步退回按节点计步竟然测不出来。
