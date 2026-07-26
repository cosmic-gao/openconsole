import { describe, expect, it } from "vitest";

import {
  Graph,
  graphId,
  nodeId,
  settle,
  shortestPaths,
  Snapshot,
  Socket,
  Vertex,
  type Sockets,
} from "../index";

/**
 * 复杂度闸门。
 *
 * 这里断言的是**同一进程里、规模翻倍时的耗时比**，不是绝对毫秒数——绝对值在同一台机器上
 * 前后两轮就能差 2–4 倍（后台扫描、降频、GC 压力），拿它当闸门只会天天误报；而"翻 4 倍规模
 * 涨了 16 倍"这种信号，无论机器快慢都成立。要挡的正是这一类掉档：某个 O(n) 变回 O(n²)。
 *
 * 阈值都留了很宽的余量：线性期望 4×，判死线放在 9×，中间那段留给常数项与 GC。
 */
const cost = (weight: number | undefined): number => weight ?? 1;

const pin = (name: string): Vertex<Sockets, Sockets, number> =>
  new Vertex<Sockets, Sockets, number>(nodeId(name))
    .addInput("in", Socket.any)
    .addOutput("out", Socket.any);

/** 取三轮里最快的一轮：慢的那些轮里混进的是调度噪声，不是被测代码。 */
const fastest = (runs: number, work: () => void): number => {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    work();
    const spent = performance.now() - started;
    if (spent < best) best = spent;
  }
  return best;
};

const hub = (fan: number): Graph<number, number> => {
  const graph = new Graph<number, number>(graphId("hub"));
  graph.addNode(pin("h"));
  for (let i = 0; i < fan; i++) {
    graph.addNode(pin(`n${i}`));
    graph.connect([nodeId("h"), "out"], [nodeId(`n${i}`), "in"], { weight: 1 });
  }
  return graph;
};

const mesh = (order: number, density: number): Graph<number, number> => {
  const graph = new Graph<number, number>(graphId("mesh"));
  for (let i = 0; i < order; i++) graph.addNode(pin(`n${i}`));
  let state = 1;
  const rand = (bound: number): number => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % bound;
  };
  for (let i = 0; i < order; i++) {
    for (let k = 0; k < density; k++) {
      const j = i + 1 + rand(Math.max(1, order - i - 1));
      if (j >= order) continue;
      graph.connect([nodeId(`n${i}`), "out"], [nodeId(`n${j}`), "in"], {
        weight: rand(9) + 1,
      });
    }
  }
  return graph;
};

describe("复杂度闸门", () => {
  /** 断言同一个删除动作在 4 倍扇出下不超过 9 倍耗时。 */
  const linear = (drain: (graph: Graph<number, number>) => void): void => {
    const small = hub(10_000);
    const large = hub(40_000);

    const one = fastest(1, () => drain(small));
    const four = fastest(1, () => drain(large));

    expect(small.size).toBe(0);
    expect(large.size).toBe(0);
    expect(four).toBeLessThan(Math.max(one, 1) * 9);
  };

  // 下面四条走的是同一条摘链原语。它若退回"在邻接表上 indexOf"，每条边都要在正在收缩的
  // 列表上线性查找一遍，四条一起变成 O(deg²)——4 万扇出从几十毫秒掉到几百毫秒。
  it("dropNode 随扇出线性增长，不随平方", () => {
    linear((graph) => void graph.dropNode(nodeId("h")));
  });

  it("逐条 disconnect 随扇出线性增长，不随平方", () => {
    linear((graph) => {
      for (const edge of graph.edges()) graph.disconnect(edge);
    });
  });

  it("clearEdges 随扇出线性增长，不随平方", () => {
    linear((graph) => void graph.clearEdges());
  });

  it("reshape 断掉全部连线随扇出线性增长，不随平方", () => {
    linear(
      (graph) => void graph.reshape(nodeId("h"), { inputs: {}, outputs: {} }),
    );
  });

  it("Snapshot.of 随边数线性增长", () => {
    const small = mesh(4000, 4);
    const large = mesh(16_000, 4);

    const one = fastest(3, () => void Snapshot.of(small, { weight: cost }));
    const four = fastest(3, () => void Snapshot.of(large, { weight: cost }));
    expect(four).toBeLessThan(Math.max(one, 1) * 9);
  });

  it("增量重编译只随改动量走，不随图规模走", () => {
    const small = mesh(4000, 4);
    const large = mesh(16_000, 4);
    const seed = (graph: Graph<number, number>): (() => void) => {
      const base = Snapshot.of(graph, { weight: cost });
      const edge = graph.edges()[0]!;
      let tick = 0;
      return () => {
        graph.setEdgeWeight(edge, (tick++ % 9) + 1);
        Snapshot.of(graph, { weight: cost, reuse: base });
      };
    };

    const one = fastest(5, seed(small));
    const four = fastest(5, seed(large));
    // 仍是 O(E)（要重算每条边的权重），但常数远小于全量编译。
    expect(four).toBeLessThan(Math.max(one, 1) * 9);
    expect(fastest(5, seed(large))).toBeLessThan(
      fastest(3, () => void Snapshot.of(large, { weight: cost })),
    );
  });

  // 节点数固定（每次调用的 O(V) 分配因此一样多），只把无关的边数放大几十倍；起点仍只够到
  // 两个节点。若每次调用都要重扫一遍全部边权（挑优先队列时的那一遍），耗时就会跟着涨。
  // 反向那一轮每次都新建 `reverse()`：画像若以结构对象为键，新对象就永远命中不了缓存。
  const views = [
    ["正向", (snapshot: Snapshot): Snapshot => snapshot],
    ["反向", (snapshot: Snapshot): Snapshot => snapshot.reverse()],
  ] as const;

  it.each(views)(
    "%s快照上的单源最短路不随图里无关的边数增长",
    (_label, view) => {
      const build = (density: number): Snapshot => {
        const graph = mesh(500, density);
        for (const name of ["s", "a", "b"]) graph.addNode(pin(name));
        graph.connect([nodeId("s"), "out"], [nodeId("a"), "in"], { weight: 1 });
        graph.connect([nodeId("a"), "out"], [nodeId("b"), "in"], { weight: 1 });
        return Snapshot.of(graph, { weight: cost });
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
    },
  );
});
