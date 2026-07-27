import { describe, expect, it } from "vitest";

import {
  apply,
  compression,
  diff,
  Graph,
  graphId,
  invert,
  nodeId,
  pack,
  Port,
  Schema,
  Socket,
  unpack,
  Vertex,
  type Sockets,
} from "../index";
import { randomGraph, vertex } from "./support";

/** 与写出顺序无关的内容指纹；图 id 单独断言。 */
function canonical(graph: Graph<number, number>): string {
  const { compact } = pack(graph);
  const byId = (a: readonly unknown[], b: readonly unknown[]): number =>
    String(a[0]).localeCompare(String(b[0]));
  return JSON.stringify({
    n: [...compact.n].sort(byId),
    e: [...compact.e].sort(byId),
    h: [...(compact.h ?? [])].map(String).sort(),
  });
}

/** 带端口约束与两层嵌套的图，覆盖格式里所有可选字段。 */
function decorated(): Graph<number, number> {
  const graph = randomGraph(51, { order: 15, density: 2 });
  graph.addNode(
    new Vertex<Sockets, Sockets, number>(nodeId("special"), 99)
      .addInput("typed", Socket.number, {
        multiple: false,
        required: true,
        fallback: 42,
      })
      .addOutput("out", Socket.string),
  );
  graph.setParent(nodeId("n1"), nodeId("n0"));
  graph.setParent(nodeId("n2"), nodeId("n1"));
  return graph;
}

describe("紧凑格式", () => {
  it("往返守恒结构、权重、端口约束与层级", () => {
    const graph = decorated();
    const restored = unpack<number, number>(pack(graph));

    expect(canonical(restored)).toBe(canonical(graph));
    const port = restored.node(nodeId("special"))!.inputs["typed"]!;
    expect(port.socket.name).toBe("number");
    expect(port.multiple).toBe(false);
    expect(port.required).toBe(true);
    expect(port.fallback).toBe(42);
    expect(restored.parent(nodeId("n2"))).toBe(nodeId("n1"));
  });

  it("按给定顺序写出节点", () => {
    const graph = randomGraph(52, { order: 8, density: 1 });
    const order = graph.nodes().slice().reverse();
    const { compact } = pack(graph, { order });
    expect(compact.n.map((entry) => entry[0])).toEqual(order);
  });

  it("intern 把长 id 换成短整数并能还原", () => {
    const graph = decorated();
    const bundle = pack(graph, { intern: true });

    expect(bundle.ids).toBeDefined();
    expect(bundle.compact.n[0]![0]).toBe("0");
    expect(canonical(unpack<number, number>(bundle))).toBe(canonical(graph));
  });

  it("keepShortIds 保留短 id", () => {
    const graph = randomGraph(53, { order: 6, density: 1 });
    const short = unpack<number, number>(pack(graph, { intern: true }), {
      keepShortIds: true,
    });

    expect(short.hasNode(nodeId("0"))).toBe(true);
    expect(short.hasNode(nodeId("n0"))).toBe(false);
    expect(short.order).toBe(graph.order);
  });

  it("写入已有的图会先清空它，但保留目标图自己的 id", () => {
    const graph = randomGraph(54, { order: 8, density: 1 });
    const target = randomGraph(55, { order: 30, density: 2 });
    unpack(pack(graph), { into: target });

    expect(canonical(target)).toBe(canonical(graph));
    expect(target.id).toBe(graphId("seed-55"));
  });

  it("版本不匹配抛 Schema", () => {
    const { compact } = pack(randomGraph(56, { order: 4 }));
    expect(() => unpack({ compact: { ...compact, v: 99 } })).toThrow(Schema);
  });

  it("紧凑格式确实比展开 JSON 小", () => {
    const report = compression(decorated());
    expect(report.ratio).toBeGreaterThan(1.5);
    expect(report.packed).toBeLessThan(report.original);
  });
});

describe("结构化差异", () => {
  it("apply 把 before 变成 after，invert 再变回来", () => {
    const before = decorated();
    const after = before.copy();

    after.dropNode(nodeId("n3"));
    after.addNode(vertex("fresh", 7));
    after.connect([nodeId("fresh"), "out"], [nodeId("n0"), "in"], { weight: 5 });
    after.setWeight(nodeId("n0"), 1000);
    after.setParent(nodeId("n4"), nodeId("n0"));
    after.unparent(nodeId("n2"));

    const changes = diff(before, after);
    const target = before.copy();

    apply(target, changes);
    expect(canonical(target)).toBe(canonical(after));
    apply(target, invert(changes));
    expect(canonical(target)).toBe(canonical(before));
  });

  it("只改权重时不产生结构变更", () => {
    const before = randomGraph(57, { order: 10, density: 2 });
    const after = before.copy();
    after.setWeight(nodeId("n0"), 12345);

    const changes = diff(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "weighNode", to: 12345 });
  });

  it("两个相同的图没有差异", () => {
    const graph = decorated();
    expect(diff(graph, graph.copy())).toEqual([]);
  });
});

describe("端口结构变了的节点按删除加重建处理", () => {
  it("连带重建那些边", () => {
    const before = new Graph<number, number>(graphId("ports"));
    before.addNode(vertex("a", 1));
    before.addNode(vertex("b", 2));
    before.connect([nodeId("a"), "out"], [nodeId("b"), "in"]);

    const after = before.copy();
    after.reshape(nodeId("a"), { inputs: { in: new Port(Socket.number) } });

    const changes = diff(before, after);
    expect(changes.some((change) => change.kind === "dropNode")).toBe(true);
    expect(changes.some((change) => change.kind === "addNode")).toBe(true);

    const target = before.copy();
    apply(target, changes);
    expect(canonical(target)).toBe(canonical(after));
  });

  /**
   * `dropNode` 会把子节点提升到祖父。若 `diff` 因为"前后父节点一致"而不产出 reparent，
   * 改了端口的分组就会丢掉整棵子树；`invert` 只是倒序，因此撤销方向也得一并守住。
   */
  const nested = (): [Graph<number, number>, Graph<number, number>] => {
    const before = new Graph<number, number>(graphId("nest"));
    before.addNode(vertex("group", 1));
    before.addNode(vertex("child", 2));
    before.addNode(vertex("leaf", 3));
    before.setParent(nodeId("child"), nodeId("group"));
    before.setParent(nodeId("leaf"), nodeId("child"));

    const after = before.copy();
    after.reshape(nodeId("group"), { outputs: {} });
    return [before, after];
  };

  it("子树父链在 apply 之后仍在", () => {
    const [before, after] = nested();
    const target = before.copy();
    apply(target, diff(before, after));

    expect(target.parent(nodeId("child"))).toBe(nodeId("group"));
    expect(target.parent(nodeId("leaf"))).toBe(nodeId("child"));
  });

  it("撤销方向同样守恒", () => {
    const [before, after] = nested();
    const changes = diff(before, after);
    const target = before.copy();

    apply(target, changes);
    apply(target, invert(changes));

    expect(target.parent(nodeId("child"))).toBe(nodeId("group"));
    expect(target.parent(nodeId("leaf"))).toBe(nodeId("child"));
    expect(target.node(nodeId("group"))!.outputs["out"]).toBeDefined();
  });
});
