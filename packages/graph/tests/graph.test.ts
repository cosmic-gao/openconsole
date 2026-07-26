import { describe, expect, it, vi } from "vitest";

import {
  Capacity,
  Duplicate,
  Graph,
  graphId,
  Mismatch,
  Missing,
  Nested,
  nodeId,
  Socket,
  Vertex,
  type EdgeId,
  type NodeId,
  type Sockets,
} from "../index";
import { randomGraph, Rng, vertex } from "./random";

const blank = (): Graph<string, number> => new Graph(graphId("t"));
const a = nodeId("a");
const b = nodeId("b");
const c = nodeId("c");

describe("节点与边", () => {
  it("新增、查询、删除节点", () => {
    const graph = blank();
    expect(graph.addNode(vertex("a", "A"))).toBe(a);
    expect(graph.order).toBe(1);
    expect(graph.node(a)?.weight).toBe("A");
    expect(graph.weightOf(a)).toBe("A");
    expect(() => graph.addNode(vertex("a", "again"))).toThrow(Duplicate);

    expect(graph.mergeNode(vertex("a", "B"))).toBe(false);
    expect(graph.weightOf(a)).toBe("B");
    expect(graph.mergeNode(vertex("b", "C"))).toBe(true);

    expect(graph.dropNode(a)).toBe(true);
    expect(graph.dropNode(a)).toBe(false);
    expect(graph.hasNode(a)).toBe(false);
    expect(graph.order).toBe(1);
  });

  it("删除节点级联清掉它的边", () => {
    const graph = blank();
    graph.addNode(vertex("a"));
    graph.addNode(vertex("b"));
    graph.connect([a, "out"], [b, "in"]);
    graph.connect([b, "out"], [a, "in"]);
    expect(graph.size).toBe(2);

    graph.dropNode(a);
    expect(graph.size).toBe(0);
    expect(graph.outEdges(b)).toEqual([]);
    expect(graph.inEdges(b)).toEqual([]);
  });

  it("节点模板按值拷入，之后改模板不影响图", () => {
    const graph = blank();
    const template = vertex("a", "A");
    graph.addNode(template);
    template.addInput("extra", Socket.number);

    expect(graph.node(a)!.inputs["extra"]).toBeUndefined();
    // 同一个模板可以复用去建别的节点。
    const second = new Vertex<Sockets, Sockets, string>(b, "B")
      .addInput("in", Socket.any)
      .addOutput("out", Socket.any);
    expect(() => graph.addNode(second)).not.toThrow();
  });

  it("连边校验端点、端口与类型", () => {
    const graph = blank();
    graph.addNode(vertex("a"));
    graph.addNode(vertex("b"));

    expect(() => graph.connect([c, "out"], [b, "in"])).toThrow(Missing);
    expect(() => graph.connect([a, "nope"], [b, "in"])).toThrow(Missing);
    expect(() => graph.connect([a, "out"], [b, "nope"])).toThrow(Missing);

    const typed = new Graph<string, number>(graphId("typed"));
    typed.addNode(
      new Vertex<Sockets, Sockets, string>(a).addOutput("out", Socket.number),
    );
    typed.addNode(
      new Vertex<Sockets, Sockets, string>(b).addInput("in", Socket.string),
    );
    expect(() => typed.connect([a, "out"], [b, "in"])).toThrow(Mismatch);
  });

  it("单连接端口拒绝第二条边", () => {
    const graph = blank();
    graph.addNode(
      new Vertex<Sockets, Sockets, string>(a).addOutput("out", Socket.any),
    );
    graph.addNode(
      new Vertex<Sockets, Sockets, string>(b).addInput("in", Socket.any, {
        multiple: false,
      }),
    );
    graph.addNode(vertex("c"));

    graph.connect([a, "out"], [b, "in"]);
    expect(() => graph.connect([c, "out"], [b, "in"])).toThrow(Capacity);
  });

  it("权重更新走函数式接口", () => {
    const graph = blank();
    graph.addNode(vertex("a", "A"));
    graph.addNode(vertex("b"));
    const edge = graph.connect([a, "out"], [b, "in"], { weight: 1 });

    graph.updateNode(a, (weight) => `${weight ?? ""}!`);
    expect(graph.weightOf(a)).toBe("A!");
    graph.updateEdge(edge, (weight) => (weight ?? 0) + 4);
    expect(graph.edgeWeight(edge)).toBe(5);
    expect(() => graph.setWeight(c, "x")).toThrow(Missing);
    expect(() => graph.setEdgeWeight("nope" as EdgeId, 1)).toThrow(Missing);
  });
});

describe("邻接查询", () => {
  const wired = (): Graph<string, number> => {
    const graph = blank();
    for (const name of ["a", "b", "c"]) graph.addNode(vertex(name));
    graph.connect([a, "out"], [b, "in"], { weight: 1 });
    graph.connect([a, "out"], [b, "in"], { weight: 2 });
    graph.connect([a, "out"], [c, "in"], { weight: 3 });
    return graph;
  };

  it("邻居与度数覆盖平行边", () => {
    const graph = wired();
    expect(graph.outNeighbors(a)).toEqual([b, b, c]);
    expect(graph.inNeighbors(b)).toEqual([a, a]);
    expect(graph.outDegree(a)).toBe(3);
    expect(graph.inDegree(b)).toBe(2);
    expect(graph.degree(a)).toBe(3);
    expect(graph.between(a, b)).toHaveLength(2);
    expect(graph.adjacent(a, b)).toBe(true);
    expect(graph.adjacent(b, a)).toBe(false);
  });

  it("删节点时自环与平行边各只处理一次，两侧邻接都摘干净", () => {
    const graph = wired();
    graph.connect([a, "out"], [a, "in"]); // 自环，同时挂在两条表上
    graph.connect([b, "out"], [a, "in"]); // 反向入边
    const dropped: EdgeId[] = [];
    graph.signal.on("edgeDropped", ({ edge }) => dropped.push(edge));

    expect(graph.dropNode(a)).toBe(true);
    expect(new Set(dropped).size).toBe(dropped.length);
    expect(dropped).toHaveLength(5);
    expect(graph.size).toBe(0);
    expect(graph.inDegree(b)).toBe(0);
    expect(graph.outDegree(b)).toBe(0);
    expect(graph.inDegree(c)).toBe(0);
  });

  it("返回的邻接是数组，可以重复遍历", () => {
    const graph = wired();
    const neighbors = graph.outNeighbors(a);
    expect([...neighbors]).toHaveLength(3);
    expect([...neighbors]).toHaveLength(3);
  });

  it("forEach 回调可提前停止", () => {
    const graph = wired();
    const seen: NodeId[] = [];
    graph.forEachOut(a, (target) => {
      seen.push(target);
      return seen.length < 2;
    });
    expect(seen).toHaveLength(2);
  });

  it("未知节点的查询返回空而不是抛错", () => {
    const graph = wired();
    expect(graph.outNeighbors(nodeId("zz"))).toEqual([]);
    expect(graph.outDegree(nodeId("zz"))).toBe(0);
    expect(graph.between(nodeId("zz"), a)).toEqual([]);
  });
});

describe("稳定索引", () => {
  it("删除不会让其余节点的索引改指", () => {
    const graph = blank();
    for (const name of ["a", "b", "c"]) graph.addNode(vertex(name));
    const before = graph.nodes().map((node) => [node, graph.indexOf(node)]);

    graph.dropNode(b);
    for (const [node, index] of before) {
      if (node === b) continue;
      expect(graph.indexOf(node as NodeId)).toBe(index);
      expect(graph.at(index as number)).toBe(node);
    }
    expect(graph.indexOf(b)).toBe(-1);
  });

  it("新节点复用空位，compact 消除空洞", () => {
    const graph = blank();
    for (const name of ["a", "b", "c"]) graph.addNode(vertex(name));
    graph.dropNode(b);
    expect(graph.bound).toBe(3);
    expect(graph.addNode(vertex("d"))).toBe(nodeId("d"));
    expect(graph.bound).toBe(3);

    graph.dropNode(nodeId("d"));
    graph.compact();
    expect(graph.bound).toBe(graph.order);
    expect(new Set(graph.nodes())).toEqual(new Set([a, c]));
  });

  it("compact 后邻接、层级、权重都仍然正确", () => {
    const graph = randomGraph(11, { order: 20, density: 2 });
    for (const node of graph.nodes().slice(0, 6)) graph.dropNode(node);
    graph.setParent(graph.nodes()[1]!, graph.nodes()[0]!);

    const before = graph.nodes().map((node) => ({
      node,
      weight: graph.weightOf(node),
      out: graph.outNeighbors(node).slice().sort(),
      parent: graph.parent(node),
    }));
    graph.compact();

    expect(graph.bound).toBe(graph.order);
    for (const record of before) {
      expect(graph.weightOf(record.node)).toBe(record.weight);
      expect(graph.outNeighbors(record.node).slice().sort()).toEqual(
        record.out,
      );
      expect(graph.parent(record.node)).toBe(record.parent);
    }
  });

  it("随机增删与 compact 之后，两侧邻接表始终与边表一致", () => {
    // 摘链靠"边记住自己在邻接表里的下标"来做到 O(1)，这份下标一旦与列表失同步，
    // 症状就是邻接表里多出或少掉某条边——遍历、编译、算法随后全都跟着错。
    const graph = randomGraph(17, { order: 40, density: 3, loops: true });
    const rng = new Rng(99);
    const audit = (): void => {
      const out = new Map<NodeId, EdgeId[]>();
      const into = new Map<NodeId, EdgeId[]>();
      for (const node of graph.nodes()) {
        out.set(node, []);
        into.set(node, []);
      }
      for (const edge of graph.edges()) {
        const record = graph.edge(edge)!;
        out.get(record.source)!.push(edge);
        into.get(record.target)!.push(edge);
      }
      for (const node of graph.nodes()) {
        expect(graph.outEdges(node).sort()).toEqual(out.get(node)!.sort());
        expect(graph.inEdges(node).sort()).toEqual(into.get(node)!.sort());
      }
    };

    for (let round = 0; round < 40; round++) {
      const dice = rng.int(10);
      if (dice < 5) {
        const edges = graph.edges();
        if (edges.length > 0) graph.disconnect(edges[rng.int(edges.length)]!);
      } else if (dice < 8) {
        const nodes = graph.nodes();
        if (nodes.length > 0) graph.dropNode(nodes[rng.int(nodes.length)]!);
      } else {
        graph.compact();
      }
      audit();
    }
  });
});

describe("复合层级", () => {
  it("父子关系与环检测", () => {
    const graph = blank();
    for (const name of ["a", "b", "c"]) graph.addNode(vertex(name));
    graph.setParent(b, a);
    graph.setParent(c, b);

    expect(graph.parent(b)).toBe(a);
    expect(graph.children(a)).toEqual([b]);
    expect(() => graph.setParent(a, c)).toThrow(Nested);
    expect(() => graph.setParent(a, a)).toThrow(Nested);
    expect(() => graph.setParent(a, nodeId("zz"))).toThrow(Missing);

    graph.unparent(b);
    expect(graph.parent(b)).toBeUndefined();
    expect(graph.children(a)).toEqual([]);
  });

  it("删除分组时子节点提升到祖父", () => {
    const graph = blank();
    for (const name of ["a", "b", "c"]) graph.addNode(vertex(name));
    graph.setParent(b, a);
    graph.setParent(c, b);

    graph.dropNode(b);
    expect(graph.parent(c)).toBe(a);
    expect(graph.children(a)).toEqual([c]);
  });

  it("删除分组时全部子节点都提升，一个不漏", () => {
    const graph = blank();
    const kids = ["k0", "k1", "k2", "k3", "k4"].map(nodeId);
    graph.addNode(vertex("root"));
    graph.addNode(vertex("group"));
    for (const kid of kids) graph.addNode(vertex(kid));
    graph.setParent(nodeId("group"), nodeId("root"));
    for (const kid of kids) graph.setParent(kid, nodeId("group"));

    graph.dropNode(nodeId("group"));
    // 摘链若落在正被迭代的子表上，补位到已访问下标的孩子会被整个跳过，其 parent
    // 留在已释放的槽位上——等那个槽位被复用，孩子就无声无息地挂到了别的节点下面。
    for (const kid of kids) expect(graph.parent(kid)).toBe(nodeId("root"));
    expect(graph.children(nodeId("root")).sort()).toEqual(kids);
  });
});

describe("事件与事务", () => {
  it("增删改与层级变更都派发事件", () => {
    const graph = blank();
    const seen: string[] = [];
    // flushed 是事务边界信号，这里只关心变更本身。
    graph.signal.watch((type) => {
      if (type !== "flushed") seen.push(type);
    });

    graph.addNode(vertex("a", "A"));
    graph.addNode(vertex("b"));
    const edge = graph.connect([a, "out"], [b, "in"]);
    graph.setWeight(a, "B");
    graph.setEdgeWeight(edge, 3);
    graph.setParent(b, a);
    graph.unparent(b);
    graph.disconnect(edge);
    graph.dropNode(a);

    expect(seen).toEqual([
      "nodeAdded",
      "nodeAdded",
      "edgeAdded",
      "nodeUpdated",
      "edgeUpdated",
      "parentChanged",
      "parentChanged",
      "edgeDropped",
      "nodeDropped",
    ]);
  });

  it("事件载荷带足撤销所需的前后值", () => {
    const graph = blank();
    const dropped = vi.fn();
    graph.signal.on("edgeDropped", dropped);
    graph.addNode(vertex("a"));
    graph.addNode(vertex("b"));
    const edge = graph.connect([a, "out"], [b, "in"], { weight: 7 });
    graph.disconnect(edge);

    expect(dropped).toHaveBeenCalledWith({
      edge,
      slot: 0,
      source: a,
      target: b,
      weight: 7,
    });
  });

  it("事务把事件推迟到最外层结束，抛错也会派发已积累的部分", () => {
    const graph = blank();
    const seen: string[] = [];
    graph.signal.watch((type) => seen.push(type));

    graph.batch(() => {
      graph.addNode(vertex("a"));
      graph.addNode(vertex("b"));
      expect(seen).toEqual([]);
    });
    expect(seen).toEqual(["nodeAdded", "nodeAdded", "flushed"]);

    seen.length = 0;
    expect(() =>
      graph.batch(() => {
        graph.addNode(vertex("c"));
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(seen).toEqual(["nodeAdded", "flushed"]);
  });

  it("flushed 收在事务末尾，并报出这段事务的变更条数", () => {
    const graph = blank();
    const counts: number[] = [];
    graph.signal.on("flushed", ({ changes }) => counts.push(changes));

    graph.addNode(vertex("a"));
    expect(counts).toEqual([1]);

    graph.batch(() => {
      graph.addNode(vertex("b"));
      graph.connect([a, "out"], [b, "in"]);
      graph.setWeight(b, "x");
      expect(counts).toEqual([1]);
    });
    expect(counts).toEqual([1, 3]);
  });

  it("handler 里继续改图，事件仍按序排在同一段事务里", () => {
    const graph = blank();
    graph.addNode(vertex("a"));
    graph.addNode(vertex("b"));

    const seen: string[] = [];
    let grown = false;
    graph.signal.watch((type) => {
      seen.push(type);
      // 第一条事件的 handler 里插一个节点：它的事件必须接在本段事务后面，
      // 而不是抢在剩余事件之前把 flushed 放掉。
      if (type === "nodeUpdated" && !grown) {
        grown = true;
        graph.addNode(vertex("c"));
      }
    });

    graph.batch(() => {
      graph.setWeight(a, "x");
      graph.setWeight(b, "y");
    });

    expect(seen).toEqual([
      "nodeUpdated",
      "nodeUpdated",
      "nodeAdded",
      "flushed",
    ]);
    expect(graph.hasNode(c)).toBe(true);
  });

  it("没有监听者时变更不构造任何载荷", () => {
    const graph = blank();
    graph.addNode(vertex("a"));
    graph.addNode(vertex("b"));
    // 纯粹的冒烟：无订阅者路径不能抛，也不能漏掉版本推进。
    const before = graph.revision;
    graph.connect([a, "out"], [b, "in"]);
    expect(graph.revision).toBeGreaterThan(before);
  });

  it("compact 派发 compacted，带旧到新的索引映射", () => {
    const graph = blank();
    for (const name of ["a", "b", "c"]) graph.addNode(vertex(name));
    const wasA = graph.indexOf(a);
    const wasC = graph.indexOf(c);
    graph.dropNode(a);

    let mapping: Int32Array | undefined;
    graph.signal.on("compacted", ({ nodes }) => {
      mapping = nodes;
    });
    graph.compact();

    expect(mapping).toBeDefined();
    expect(mapping![wasA]).toBe(-1);
    expect(mapping![wasC]).toBe(graph.indexOf(c));
  });

  it("clear 走删除原语，订阅者不会与图失同步", () => {
    const graph = blank();
    for (const name of ["a", "b"]) graph.addNode(vertex(name));
    graph.connect([a, "out"], [b, "in"]);

    const seen: string[] = [];
    graph.signal.watch((type) => seen.push(type));
    graph.clear();

    expect(graph.order).toBe(0);
    expect(graph.size).toBe(0);
    expect(seen).toEqual([
      "edgeDropped",
      "nodeDropped",
      "nodeDropped",
      "flushed",
    ]);
  });

  it("revision 随每次变更推进", () => {
    const graph = blank();
    const start = graph.revision;
    graph.addNode(vertex("a"));
    expect(graph.revision).toBeGreaterThan(start);
    const afterAdd = graph.revision;
    graph.setWeight(a, "x");
    expect(graph.revision).toBeGreaterThan(afterAdd);
  });

  it("shape 只跟结构走，改权重不动它", () => {
    const graph = blank();
    graph.addNode(vertex("a"));
    graph.addNode(vertex("b"));
    const edge = graph.connect([a, "out"], [b, "in"]);

    const shape = graph.shape;
    graph.setWeight(a, "x");
    graph.setEdgeWeight(edge, 9);
    expect(graph.shape).toBe(shape);
    expect(graph.revision).toBeGreaterThan(shape);

    graph.disconnect(edge);
    expect(graph.shape).toBeGreaterThan(shape);
  });

  it("删高扇出节点是线性的，不在自身邻接表上反复线性查找", () => {
    const graph = new Graph<number, number>(graphId("hub"));
    graph.addNode(vertex("hub", 0));
    for (let i = 0; i < 100_000; i++) {
      graph.addNode(vertex(`n${i}`, i));
      graph.connect([nodeId("hub"), "out"], [nodeId(`n${i}`), "in"]);
    }

    const started = performance.now();
    graph.dropNode(nodeId("hub"));
    // O(deg²) 时这一步是秒级；线性实现在任何机器上都远在此界之内。
    expect(performance.now() - started).toBeLessThan(1000);
    expect(graph.size).toBe(0);
  });
});

describe("派生图", () => {
  it("copy 是深拷贝，改副本不影响原图", () => {
    const graph = randomGraph(5, { order: 12, density: 2 });
    graph.setParent(nodeId("n1"), nodeId("n0"));
    const clone = graph.copy();

    expect(clone.order).toBe(graph.order);
    expect(clone.size).toBe(graph.size);
    expect(clone.parent(nodeId("n1"))).toBe(nodeId("n0"));
    clone.dropNode(nodeId("n0"));
    expect(graph.hasNode(nodeId("n0"))).toBe(true);
  });

  it("subgraph 只留两端都在集合内的边", () => {
    const graph = randomGraph(6, { order: 12, density: 2 });
    const keep = new Set(graph.nodes().slice(0, 5));
    const part = graph.subgraph(keep);

    expect(new Set(part.nodes())).toEqual(keep);
    for (const edge of part.edges()) {
      const record = part.edge(edge)!;
      expect(keep.has(record.source)).toBe(true);
      expect(keep.has(record.target)).toBe(true);
    }
  });

  it("拷贝后自动编号接着原图走，不从头逐个撞已占用的 id", () => {
    const graph = randomGraph(7, { order: 30, density: 2 });
    const used = new Set(graph.edges());
    const clone = graph.copy();
    clone.addNode(vertex("fresh", 0));

    const minted = clone.connect(
      [nodeId("fresh"), "out"],
      [nodeId("n0"), "in"],
    );
    expect(used.has(minted)).toBe(false);
    expect(Number(minted.slice(1))).toBeGreaterThanOrEqual(used.size);
  });

  it("union 合并两图，重复项以本图为准", () => {
    const left = blank();
    left.addNode(vertex("a", "left"));
    const right = blank();
    right.addNode(vertex("a", "right"));
    right.addNode(vertex("b", "only-right"));

    const merged = left.union(right);
    expect(merged.weightOf(a)).toBe("left");
    expect(merged.weightOf(b)).toBe("only-right");
  });
});
