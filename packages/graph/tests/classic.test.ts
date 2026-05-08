/**
 * 测试覆盖：`./classic` 中的 Socket / Port / Input / Output / Node / Endpoint / Edge / Graph。
 */
import { describe, expect, it } from 'vitest';

import {
  Edge,
  Endpoint,
  Graph,
  Input,
  Node,
  Output,
  Socket,
  type EdgeId,
  type GraphId,
  type NodeId,
  type PortId,
  type Sockets,
} from '../core';

// 测试中直接用默认 `Sockets` 索引签名，避免 interface 与 index-signature 的细节冲突。
const id = <T extends string>(v: string) => v as unknown as T;
const newGraph = () => new Graph<unknown, unknown>(id<GraphId>('g'));

const makeNumNode = (name: string) => {
  const n = new Node(id<NodeId>(name));
  n.addInput('x', Socket.number);
  n.addOutput('y', Socket.number);
  return n;
};

const makeStrNode = (name: string) => {
  const n = new Node(id<NodeId>(name));
  n.addInput('s', Socket.string);
  n.addOutput('s', Socket.string);
  return n;
};

describe('Socket', () => {
  it('内置 Socket 命中同名兼容', () => {
    expect(Socket.number.matches(Socket.number)).toBe(true);
    expect(Socket.string.matches(Socket.string)).toBe(true);
  });

  it('any (`*`) 与任意类型互通', () => {
    expect(Socket.any.matches(Socket.number)).toBe(true);
    expect(Socket.number.matches(Socket.any)).toBe(true);
  });

  it('不同名 Socket 互不兼容', () => {
    expect(Socket.number.matches(Socket.string)).toBe(false);
  });

  it('compatible 列表生效', () => {
    const a = Socket.from('a', [Socket.number]);
    expect(a.matches(Socket.number)).toBe(true);
    // 单向语义：Socket.number 没有 'a' 兼容声明，因此 Socket.number.matches(a) 为 false
    expect(Socket.number.matches(a)).toBe(false);
  });

  it('Socket.from 工厂复用相同字段', () => {
    const s = Socket.from('foo', [Socket.string]);
    expect(s.name).toBe('foo');
    expect(s.compatible).toEqual([Socket.string]);
  });
});

describe('Port (Input / Output)', () => {
  it('Input 与 Output 暴露正确的 direction', () => {
    const inp = new Input(Socket.number, id<PortId>('p:i'));
    const out = new Output(Socket.number, id<PortId>('p:o'));
    expect(inp.direction).toBe('input');
    expect(out.direction).toBe('output');
  });

  it('attach / detach 维护边列表', () => {
    const port = new Output(Socket.number, id<PortId>('p:o'));
    expect(port.connected).toBe(false);
    port.attach(id<EdgeId>('e1'));
    port.attach(id<EdgeId>('e2'));
    expect(port.edges).toEqual(['e1', 'e2']);
    expect(port.connected).toBe(true);
    expect(port.detach(id<EdgeId>('e1'))).toBe(true);
    expect(port.edges).toEqual(['e2']);
    expect(port.detach(id<EdgeId>('missing'))).toBe(false);
  });

  it('attach 不再做 includes 去重 (Graph.addEdge 已在上游保证)', () => {
    const port = new Output(Socket.number, id<PortId>('p:o'));
    port.attach(id<EdgeId>('e1'));
    port.attach(id<EdgeId>('e1'));
    expect(port.edges).toHaveLength(2);
  });
});

describe('Node', () => {
  it('addInput / addOutput 注册端口并自动生成 ID', () => {
    const n = new Node(id<NodeId>('A'));
    const inp = n.addInput('x', Socket.number);
    const out = n.addOutput('y', Socket.number);
    expect(inp.id).toBe('A:input:x');
    expect(out.id).toBe('A:output:y');
    expect(n.hasInput('x')).toBe(true);
    expect(n.hasOutput('y')).toBe(true);
    expect(n.input('x')).toBe(inp);
    expect(n.output('y')).toBe(out);
  });

  it('removeInput / removeOutput 正确删除端口', () => {
    const n = makeNumNode('A');
    expect(n.removeInput('x')).toBe(true);
    expect(n.hasInput('x')).toBe(false);
    expect(n.removeInput('x')).toBe(false);
    expect(n.removeOutput('y')).toBe(true);
    expect(n.removeOutput('y')).toBe(false);
  });

  it('weight 可读写', () => {
    const n = new Node<Sockets, Sockets, { label: string }>(id<NodeId>('A'), { label: 'init' });
    expect(n.weight).toEqual({ label: 'init' });
    n.weight = { label: 'changed' };
    expect(n.weight?.label).toBe('changed');
  });
});

describe('Endpoint / Edge', () => {
  it('Endpoint 提供 nodeId / portId 访问器', () => {
    const A = makeNumNode('A');
    const ep = new Endpoint(A, A.output('y')!);
    expect(ep.nodeId).toBe('A');
    expect(ep.portId).toBe('A:output:y');
  });

  it('Edge.connects / sourceId / targetId / opposite', () => {
    const A = makeNumNode('A');
    const B = makeNumNode('B');
    const edge = new Edge(
      id<EdgeId>('e1'),
      new Endpoint(A, A.output('y')!),
      new Endpoint(B, B.input('x')!),
      'w',
    );
    expect(edge.sourceId).toBe('A');
    expect(edge.targetId).toBe('B');
    expect(edge.connects(id<NodeId>('A'))).toBe(true);
    expect(edge.connects(id<NodeId>('C'))).toBe(false);
    expect(edge.opposite('input')).toBe('A');
    expect(edge.opposite('output')).toBe('B');
    expect(edge.weight).toBe('w');
  });
});

describe('Graph - 基础结构', () => {
  it('addNode 重复 ID 抛错', () => {
    const g = newGraph();
    g.addNode(makeNumNode('A'));
    expect(() => g.addNode(makeNumNode('A'))).toThrow(/already exists/);
  });

  it('addEdge 校验 source / target / 端口归属 / 方向 / Socket 兼容', () => {
    const g = newGraph();
    const A = makeNumNode('A');
    const B = makeNumNode('B');
    g.addNode(A).addNode(B);

    // 1. source 节点未注册
    const orphan = makeNumNode('Orphan');
    expect(() => {
      g.addEdge(new Edge(id<EdgeId>('e1'),
        new Endpoint(orphan, orphan.output('y')!),
        new Endpoint(B, B.input('x')!)));
    }).toThrow(/source node "Orphan" does not exist/);

    // 2. 端点指向同 ID 但不同实例的节点
    const fakeA = makeNumNode('A');
    expect(() => {
      g.addEdge(new Edge(id<EdgeId>('e2'),
        new Endpoint(fakeA, fakeA.output('y')!),
        new Endpoint(B, B.input('x')!)));
    }).toThrow(/source endpoint references a Node that is not the one registered/);

    // 3. source 是 input 端口：先在 _owns 阶段被拒（input 不属于 node.outputs）
    expect(() => {
      g.addEdge(new Edge(id<EdgeId>('e3'),
        new Endpoint(A, A.input('x')!) as unknown as Endpoint,
        new Endpoint(B, B.input('x')!)));
    }).toThrow(/source port "A:input:x" not found on node "A"/);

    // 4. Socket 类型不兼容
    const C = makeStrNode('C');
    g.addNode(C);
    expect(() => {
      g.addEdge(new Edge(id<EdgeId>('e4'),
        new Endpoint(A, A.output('y')!),
        new Endpoint(C, C.input('s')!)));
    }).toThrow(/socket type "number" \(source\) is incompatible with "string" \(target\)/);
  });

  it('addEdge 重复 ID 抛错', () => {
    const g = newGraph();
    const A = makeNumNode('A');
    const B = makeNumNode('B');
    g.addNode(A).addNode(B);
    g.addEdge(new Edge(id<EdgeId>('e1'),
      new Endpoint(A, A.output('y')!),
      new Endpoint(B, B.input('x')!)));
    expect(() => {
      g.addEdge(new Edge(id<EdgeId>('e1'),
        new Endpoint(A, A.output('y')!),
        new Endpoint(B, B.input('x')!)));
    }).toThrow(/already exists/);
  });

  it('removeNode 同步清理两端的边', () => {
    const g = newGraph();
    const A = makeNumNode('A');
    const B = makeNumNode('B');
    const C = makeNumNode('C');
    g.addNode(A).addNode(B).addNode(C);
    g.addEdge(new Edge(id<EdgeId>('e1'), new Endpoint(A, A.output('y')!), new Endpoint(B, B.input('x')!)));
    g.addEdge(new Edge(id<EdgeId>('e2'), new Endpoint(B, B.output('y')!), new Endpoint(C, C.input('x')!)));
    expect(g.edgeCount()).toBe(2);

    g.removeNode(id<NodeId>('B'));

    expect(g.hasNode(id<NodeId>('B'))).toBe(false);
    expect(g.edgeCount()).toBe(0);
    expect(A.output('y')!.edges).toEqual([]); // 被删节点 B 是 e1 的终点 → A.output 端的 attach 应被解开
    expect(C.input('x')!.edges).toEqual([]);  // 被删节点 B 是 e2 的起点 → C.input 端的 attach 应被解开
  });

  it('removeNode 处理自环', () => {
    const g = newGraph();
    const A = makeNumNode('A');
    g.addNode(A);
    g.addEdge(new Edge(id<EdgeId>('self'),
      new Endpoint(A, A.output('y')!),
      new Endpoint(A, A.input('x')!)));
    expect(g.edgeCount()).toBe(1);
    expect(g.removeNode(id<NodeId>('A'))).toBeDefined();
    expect(g.edgeCount()).toBe(0);
  });

  it('findEdge / edgeEndpoints / edgesBetween / edgesConnecting', () => {
    const g = newGraph();
    const A = makeNumNode('A');
    const B = makeNumNode('B');
    g.addNode(A).addNode(B);
    g.addEdge(new Edge(id<EdgeId>('e1'), new Endpoint(A, A.output('y')!), new Endpoint(B, B.input('x')!)));
    g.addEdge(new Edge(id<EdgeId>('e2'), new Endpoint(B, B.output('y')!), new Endpoint(A, A.input('x')!)));

    expect(g.findEdge(id<NodeId>('A'), id<NodeId>('B'))?.id).toBe('e1');
    expect(g.findEdge(id<NodeId>('A'), id<NodeId>('Missing'))).toBeUndefined();
    expect(g.edgeEndpoints(id<EdgeId>('e1'))).toEqual(['A', 'B']);
    expect(g.edgesBetween(id<NodeId>('A'), id<NodeId>('B')).map(e => e.id)).toEqual(['e1']);
    expect(g.edgesConnecting(id<NodeId>('A'), id<NodeId>('B')).map(e => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('predecessors / successors / adjacencies / degree', () => {
    const g = newGraph();
    const A = makeNumNode('A');
    const B = makeNumNode('B');
    const C = makeNumNode('C');
    g.addNode(A).addNode(B).addNode(C);
    g.addEdge(new Edge(id<EdgeId>('e1'), new Endpoint(A, A.output('y')!), new Endpoint(B, B.input('x')!)));
    g.addEdge(new Edge(id<EdgeId>('e2'), new Endpoint(B, B.output('y')!), new Endpoint(C, C.input('x')!)));

    expect(g.successors(id<NodeId>('A'))).toEqual(['B']);
    expect(g.predecessors(id<NodeId>('C'))).toEqual(['B']);
    expect(g.adjacencies(id<NodeId>('B')).sort()).toEqual(['A', 'C']);
    expect(g.inDegree(id<NodeId>('B'))).toBe(1);
    expect(g.outDegree(id<NodeId>('B'))).toBe(1);
    expect(g.degree(id<NodeId>('B'))).toBe(2);
  });

  it('sources / sinks / isolated', () => {
    const g = newGraph();
    const A = makeNumNode('A');
    const B = makeNumNode('B');
    const C = makeNumNode('C'); // 孤立
    g.addNode(A).addNode(B).addNode(C);
    g.addEdge(new Edge(id<EdgeId>('e1'), new Endpoint(A, A.output('y')!), new Endpoint(B, B.input('x')!)));

    expect(g.sources().map(n => n.id).sort()).toEqual(['A', 'C']);
    expect(g.sinks().map(n => n.id).sort()).toEqual(['B', 'C']);
    expect(g.isolated().map(n => n.id)).toEqual(['C']);
  });

  it('clear / empty', () => {
    const g = newGraph();
    expect(g.empty()).toBe(true);
    g.addNode(makeNumNode('A'));
    expect(g.empty()).toBe(false);
    g.clear();
    expect(g.empty()).toBe(true);
    expect(g.nodeCount()).toBe(0);
    expect(g.edgeCount()).toBe(0);
  });

  it('toJson 输出可被 JSON.stringify 序列化', () => {
    const g = newGraph();
    const A = makeNumNode('A');
    g.addNode(A);
    const snapshot = g.toJson() as { id: string; nodes: unknown[]; edges: unknown[] };
    expect(snapshot.id).toBe('g');
    expect(Array.isArray(snapshot.nodes)).toBe(true);
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

  it('NodeIndexable: bound / at / indexOf', () => {
    const g = newGraph();
    const A = makeNumNode('A');
    const B = makeNumNode('B');
    g.addNode(A).addNode(B);
    expect(g.bound()).toBe(2);
    expect(g.at(0)).toBe('A');
    expect(g.at(1)).toBe('B');
    expect(g.at(99)).toBeUndefined();
    expect(g.indexOf(id<NodeId>('B'))).toBe(1);
    expect(g.indexOf(id<NodeId>('missing'))).toBe(-1);
  });

  it('Visitable: marks / reset', () => {
    const g = newGraph();
    g.addNode(makeNumNode('A'));
    g.addNode(makeNumNode('B'));
    const m = g.marks();
    expect(m.size).toBe(2);
    expect([...m.values()]).toEqual([false, false]);
    m.set(id<NodeId>('A'), true);
    g.reset(m);
    expect([...m.values()]).toEqual([false, false]);
  });
});
