import { describe, expect, it, vi } from "vitest";

import {
  Capacity,
  Graph,
  graphId,
  Missing,
  nodeId,
  Port,
  Socket,
  Vertex,
  type EdgeId,
  type NodeId,
  type Ports,
  type Sockets,
} from "../index";

const exec = (multiple: boolean): Port => new Port(Socket.exec, { multiple });
const data = (socket: Socket, multiple: boolean): Port =>
  new Port(socket, { multiple });

/** 蓝图形态：exec 输出单连、exec 输入多连、data 输出多连、data 输入单连。 */
const blueprint = (): Graph<string, void> => {
  const graph = new Graph<string, void>(graphId("blueprint"));
  graph.addNode({
    id: nodeId("start"),
    weight: "Event",
    outputs: { then: exec(false) },
  });
  graph.addNode({
    id: nodeId("branch"),
    weight: "Branch",
    inputs: { exec: exec(true), condition: data(Socket.boolean, false) },
    outputs: { true: exec(false), false: exec(false) },
  });
  graph.addNode({
    id: nodeId("compare"),
    weight: "Greater",
    inputs: { a: data(Socket.number, false), b: data(Socket.number, false) },
    outputs: { result: data(Socket.boolean, true) },
  });
  for (const name of ["yes", "no"]) {
    graph.addNode({
      id: nodeId(name),
      weight: "Print",
      inputs: { exec: exec(true) },
      outputs: { then: exec(false) },
    });
  }

  graph.connect([nodeId("start"), "then"], [nodeId("branch"), "exec"]);
  graph.connect([nodeId("compare"), "result"], [nodeId("branch"), "condition"]);
  graph.connect([nodeId("branch"), "true"], [nodeId("yes"), "exec"]);
  graph.connect([nodeId("branch"), "false"], [nodeId("no"), "exec"]);
  return graph;
};

describe("引脚约束", () => {
  it("exec 输出只能连一条，第二条抛 Capacity", () => {
    const graph = blueprint();
    expect(() =>
      graph.connect([nodeId("branch"), "true"], [nodeId("no"), "exec"]),
    ).toThrow(Capacity);
  });

  it("exec 输入可以被多条连（分支汇聚）", () => {
    const graph = blueprint();
    graph.addNode({
      id: nodeId("join"),
      inputs: { exec: exec(true) },
    });
    graph.connect([nodeId("yes"), "then"], [nodeId("join"), "exec"]);
    expect(() =>
      graph.connect([nodeId("no"), "then"], [nodeId("join"), "exec"]),
    ).not.toThrow();
    expect(graph.inDegree(nodeId("join"))).toBe(2);
  });

  it("data 输出可以连多条，data 输入只能连一条", () => {
    const graph = blueprint();
    graph.addNode({
      id: nodeId("also"),
      inputs: { flag: data(Socket.boolean, false) },
    });
    graph.connect([nodeId("compare"), "result"], [nodeId("also"), "flag"]);
    expect(graph.outDegree(nodeId("compare"))).toBe(2);

    graph.addNode({
      id: nodeId("other"),
      outputs: { result: data(Socket.boolean, true) },
    });
    expect(() =>
      graph.connect([nodeId("other"), "result"], [nodeId("also"), "flag"]),
    ).toThrow(Capacity);
  });
});

describe("按端口查边", () => {
  it("linkedTo 取某个输出引脚的目标", () => {
    const graph = blueprint();
    expect(graph.linkedTo(nodeId("start"), "then")).toBe(nodeId("branch"));
    expect(graph.linkedTo(nodeId("branch"), "true")).toBe(nodeId("yes"));
    expect(graph.linkedTo(nodeId("branch"), "false")).toBe(nodeId("no"));
  });

  it("linkedFrom 取某个输入引脚的来源", () => {
    const graph = blueprint();
    expect(graph.linkedFrom(nodeId("branch"), "condition")).toBe(
      nodeId("compare"),
    );
    expect(graph.linkedFrom(nodeId("branch"), "exec")).toBe(nodeId("start"));
  });

  it("未连接的引脚、未知端口、未知节点都返回 undefined", () => {
    const graph = blueprint();
    expect(graph.linkedFrom(nodeId("compare"), "a")).toBeUndefined();
    expect(graph.linkedTo(nodeId("start"), "missing")).toBeUndefined();
    expect(graph.linkedTo(nodeId("ghost"), "then")).toBeUndefined();
  });

  it("多连接引脚上 linkedTo 给首个，forEachOut 给全部", () => {
    const graph = blueprint();
    graph.addNode({
      id: nodeId("also"),
      inputs: { flag: data(Socket.boolean, false) },
    });
    graph.connect([nodeId("compare"), "result"], [nodeId("also"), "flag"]);

    expect(graph.linkedTo(nodeId("compare"), "result")).toBe(nodeId("branch"));
    const targets: NodeId[] = [];
    graph.forEachOut(nodeId("compare"), (target, _edge, port) => {
      if (port === "result") targets.push(target);
    });
    expect(targets).toEqual([nodeId("branch"), nodeId("also")]);
  });

  it("forEachOut 的 port 是本端端口名，forEachIn 同理", () => {
    const graph = blueprint();
    const out: string[] = [];
    graph.forEachOut(nodeId("branch"), (_target, _edge, port) => {
      out.push(port);
    });
    expect(out.sort()).toEqual(["false", "true"]);

    const into: string[] = [];
    graph.forEachIn(nodeId("branch"), (_source, _edge, port) => {
      into.push(port);
    });
    expect(into.sort()).toEqual(["condition", "exec"]);
  });

  it("visit 返回 false 能提前停止", () => {
    const graph = blueprint();
    const seen: string[] = [];
    graph.forEachOut(nodeId("branch"), (_target, _edge, port) => {
      seen.push(port);
      return false;
    });
    expect(seen).toHaveLength(1);
  });
});

describe("reshape", () => {
  it("加引脚不动现有连线", () => {
    const graph = blueprint();
    const before = graph.size;
    graph.reshape(nodeId("branch"), {
      inputs: {
        exec: exec(true),
        condition: data(Socket.boolean, false),
        fallthrough: exec(true),
      },
    });

    expect(graph.size).toBe(before);
    expect(graph.node(nodeId("branch"))!.inputs["fallthrough"]).toBeDefined();
    expect(graph.linkedFrom(nodeId("branch"), "condition")).toBe(
      nodeId("compare"),
    );
  });

  it("删引脚只断该引脚上的边", () => {
    const graph = blueprint();
    graph.reshape(nodeId("branch"), {
      outputs: { true: exec(false) },
    });

    expect(graph.linkedTo(nodeId("branch"), "true")).toBe(nodeId("yes"));
    expect(graph.linkedTo(nodeId("branch"), "false")).toBeUndefined();
    expect(graph.inDegree(nodeId("no"))).toBe(0);
  });

  it("Socket 变得不兼容时断边，仍兼容则保留", () => {
    const graph = blueprint();
    graph.reshape(nodeId("compare"), {
      outputs: { result: data(Socket.string, true) },
    });
    expect(graph.linkedTo(nodeId("compare"), "result")).toBeUndefined();

    const kept = blueprint();
    kept.reshape(nodeId("compare"), {
      outputs: { result: data(Socket.any, true) },
    });
    expect(kept.linkedTo(nodeId("compare"), "result")).toBe(nodeId("branch"));
  });

  it("容量收紧为单连接时保留最早那条", () => {
    const graph = new Graph<void, void>(graphId("narrow"));
    graph.addNode({
      id: nodeId("hub"),
      outputs: { out: data(Socket.number, true) },
    });
    for (const name of ["a", "b", "c"]) {
      graph.addNode({
        id: nodeId(name),
        inputs: { in: data(Socket.number, false) },
      });
      graph.connect([nodeId("hub"), "out"], [nodeId(name), "in"]);
    }

    graph.reshape(nodeId("hub"), {
      outputs: { out: data(Socket.number, false) },
    });
    expect(graph.outDegree(nodeId("hub"))).toBe(1);
    expect(graph.linkedTo(nodeId("hub"), "out")).toBe(nodeId("a"));
  });

  it("省略的一侧保持不变", () => {
    const graph = blueprint();
    graph.reshape(nodeId("branch"), { outputs: { true: exec(false) } });

    const ports = graph.node(nodeId("branch"))!.inputs;
    expect(Object.keys(ports).sort()).toEqual(["condition", "exec"]);
    expect(graph.linkedFrom(nodeId("branch"), "exec")).toBe(nodeId("start"));
  });

  it("派发 nodeReshaped 与被断边的 edgeDropped", () => {
    const graph = blueprint();
    const reshaped = vi.fn();
    const dropped = vi.fn();
    graph.signal.on("nodeReshaped", reshaped);
    graph.signal.on("edgeDropped", dropped);

    graph.reshape(nodeId("branch"), { outputs: { true: exec(false) } });

    expect(dropped).toHaveBeenCalledTimes(1);
    expect(reshaped).toHaveBeenCalledTimes(1);
    const payload = reshaped.mock.calls[0]![0] as {
      node: NodeId;
      outputs: Ports;
    };
    expect(payload.node).toBe(nodeId("branch"));
    expect(Object.keys(payload.outputs)).toEqual(["true"]);
  });

  it("在事务里 reshape，事件推迟到末尾", () => {
    const graph = blueprint();
    const order: string[] = [];
    graph.signal.watch((type) => order.push(type));

    graph.batch(() => {
      graph.reshape(nodeId("branch"), { outputs: { true: exec(false) } });
      expect(order).toHaveLength(0);
    });
    expect(order).toEqual(["edgeDropped", "nodeReshaped", "flushed"]);
  });

  it("节点不存在时抛 Missing", () => {
    const graph = blueprint();
    expect(() => graph.reshape(nodeId("ghost"), { inputs: {} })).toThrow(
      Missing,
    );
  });

  it("清空两侧端口等于断掉该节点所有连线，但节点还在", () => {
    const graph = blueprint();
    graph.reshape(nodeId("branch"), { inputs: {}, outputs: {} });

    expect(graph.hasNode(nodeId("branch"))).toBe(true);
    expect(graph.degree(nodeId("branch"))).toBe(0);
    expect(graph.size).toBe(0);
  });

  it("reshape 后仍能重新连线", () => {
    const graph = blueprint();
    graph.reshape(nodeId("branch"), {
      outputs: { true: exec(false), false: exec(false), always: exec(false) },
    });
    graph.connect([nodeId("branch"), "always"], [nodeId("yes"), "exec"]);
    expect(graph.linkedTo(nodeId("branch"), "always")).toBe(nodeId("yes"));
  });

  it("Vertex 模板可作为 reshape 的入参", () => {
    const graph = blueprint();
    const template = new Vertex<Sockets, Sockets, string>(nodeId("branch"))
      .addOutput("true", Socket.exec)
      .addOutput("false", Socket.exec)
      .addOutput("done", Socket.exec);

    graph.reshape(nodeId("branch"), template);
    expect(Object.keys(graph.node(nodeId("branch"))!.outputs).sort()).toEqual([
      "done",
      "false",
      "true",
    ]);
  });
});

describe("沿 exec 边执行", () => {
  it("按引脚走出一条执行路径", () => {
    const graph = blueprint();
    graph.addNode({ id: nodeId("end"), inputs: { exec: exec(true) } });
    graph.connect([nodeId("yes"), "then"], [nodeId("end"), "exec"]);

    // 指令指针：从事件节点起，沿 exec 引脚单步走，分支处按条件选引脚。
    const trail: NodeId[] = [];
    let cursor: NodeId | undefined = nodeId("start");
    let pin = "then";
    while (cursor !== undefined) {
      trail.push(cursor);
      const next: NodeId | undefined = graph.linkedTo(cursor, pin);
      if (next === undefined) break;
      cursor = next;
      pin = graph.weightOf(cursor) === "Branch" ? "true" : "then";
    }

    expect(trail).toEqual([
      nodeId("start"),
      nodeId("branch"),
      nodeId("yes"),
      nodeId("end"),
    ]);
  });

  it("data 引脚上游可递归拉取", () => {
    const graph = blueprint();
    graph.addNode({
      id: nodeId("five"),
      weight: "Literal",
      outputs: { value: data(Socket.number, true) },
    });
    graph.connect([nodeId("five"), "value"], [nodeId("compare"), "a"]);

    const pull = (node: NodeId, port: string): NodeId[] => {
      const source = graph.linkedFrom(node, port);
      if (source === undefined) return [];
      const upstream: NodeId[] = [source];
      graph.forEachIn(source, (from) => {
        upstream.push(from);
      });
      return upstream;
    };

    expect(pull(nodeId("branch"), "condition")).toEqual([
      nodeId("compare"),
      nodeId("five"),
    ]);
    expect(pull(nodeId("compare"), "b")).toEqual([]);
  });
});

describe("三形态共用同一底座", () => {
  it("Node-RED 形态：无类型校验、索引端口、反馈环合法", () => {
    const graph = new Graph<string, void>(graphId("nodered"));
    const wires = (count: number): Ports =>
      Object.fromEntries(
        Array.from({ length: count }, (_, i) => [
          String(i),
          new Port(Socket.any),
        ]),
      );

    graph.addNode({ id: nodeId("inject"), outputs: wires(1) });
    graph.addNode({ id: nodeId("fn"), inputs: wires(1), outputs: wires(2) });
    graph.addNode({ id: nodeId("debug"), inputs: wires(1) });

    graph.connect([nodeId("inject"), "0"], [nodeId("fn"), "0"]);
    graph.connect([nodeId("fn"), "0"], [nodeId("debug"), "0"]);
    // 反馈回路：Node-RED 里合法，图本体不拦。
    graph.connect([nodeId("fn"), "1"], [nodeId("fn"), "0"]);

    expect(graph.linkedTo(nodeId("fn"), "1")).toBe(nodeId("fn"));
    expect(graph.size).toBe(3);
  });

  it("n8n 形态：扇出多个下游，输入端口可合并多路", () => {
    const graph = new Graph<string, void>(graphId("n8n"));
    const main = (): Ports => ({ main: new Port(Socket.object) });

    graph.addNode({ id: nodeId("trigger"), outputs: main() });
    for (const name of ["http", "sheet"]) {
      graph.addNode({ id: nodeId(name), inputs: main(), outputs: main() });
      graph.connect([nodeId("trigger"), "main"], [nodeId(name), "main"]);
    }
    graph.addNode({ id: nodeId("merge"), inputs: main() });
    graph.connect([nodeId("http"), "main"], [nodeId("merge"), "main"]);
    graph.connect([nodeId("sheet"), "main"], [nodeId("merge"), "main"]);

    expect(graph.outDegree(nodeId("trigger"))).toBe(2);
    expect(graph.inDegree(nodeId("merge"))).toBe(2);
  });

  it("动态改引脚数是三形态共同动作", () => {
    const graph = new Graph<string, void>(graphId("dynamic"));
    graph.addNode({
      id: nodeId("switch"),
      outputs: { "0": new Port(Socket.any) },
    });
    graph.addNode({ id: nodeId("a"), inputs: { in: new Port(Socket.any) } });
    graph.addNode({ id: nodeId("b"), inputs: { in: new Port(Socket.any) } });
    const kept: EdgeId = graph.connect(
      [nodeId("switch"), "0"],
      [nodeId("a"), "in"],
    );

    graph.reshape(nodeId("switch"), {
      outputs: { "0": new Port(Socket.any), "1": new Port(Socket.any) },
    });
    graph.connect([nodeId("switch"), "1"], [nodeId("b"), "in"]);

    expect(graph.hasEdge(kept)).toBe(true);
    expect(graph.outDegree(nodeId("switch"))).toBe(2);
  });
});
