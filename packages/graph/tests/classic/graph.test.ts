/**
 * 测试覆盖：Graph 主容器 - 增删、校验、邻接查询、度数、视图协议（Catalog/Neighbors/NodeIndexable/Visitable）。
 */
import { describe, expect, it } from 'vitest';

import {
  Edge,
  Endpoint,
  Graph,
  Vertex,
  Socket,
  isolated,
  sinks,
  sources,
  type EdgeId,
  type GraphId,
  type NodeId,
} from '../../core';
import { id, portNode } from '../_fixtures';

const newGraph = () => new Graph<unknown, unknown>(id<GraphId>('g'));

const makeStrNode = (name: string) => {
  const n = new Vertex(id<NodeId>(name));
  n.addInput('s', Socket.string);
  n.addOutput('s', Socket.string);
  return n;
};

describe('Graph - 基础结构', () => {
  it('addNode 重复 ID 抛错', () => {
    const g = newGraph();
    g.addNode(portNode('A'));
    expect(() => g.addNode(portNode('A'))).toThrow(/already exists/);
  });

  it('addEdge 校验 source / target / 端口归属 / 方向 / Socket 兼容', () => {
    const g = newGraph();
    const A = portNode('A');
    const B = portNode('B');
    g.addNode(A).addNode(B);

    // 1. source 节点未注册
    const orphan = portNode('Orphan');
    expect(() => {
      g.addEdge(new Edge(id<EdgeId>('e1'),
        new Endpoint(orphan, orphan.output('y')!),
        new Endpoint(B, B.input('x')!)));
    }).toThrow(/node "Orphan" not found/);

    // 2. 端点指向同 ID 但不同实例的节点
    const fakeA = portNode('A');
    expect(() => {
      g.addEdge(new Edge(id<EdgeId>('e2'),
        new Endpoint(fakeA, fakeA.output('y')!),
        new Endpoint(B, B.input('x')!)));
    }).toThrow(/referenced by edge "e2" source/);

    // 3. source 是 input 端口：先在 _owns 阶段被拒（input 不属于 node.outputs）
    expect(() => {
      g.addEdge(new Edge(id<EdgeId>('e3'),
        new Endpoint(A, A.input('x')!) as unknown as Endpoint,
        new Endpoint(B, B.input('x')!)));
    }).toThrow(/port "A:input:x" not found.*not on node "A"/);

    // 4. Socket 类型不兼容
    const C = makeStrNode('C');
    g.addNode(C);
    expect(() => {
      g.addEdge(new Edge(id<EdgeId>('e4'),
        new Endpoint(A, A.output('y')!),
        new Endpoint(C, C.input('s')!)));
    }).toThrow(/socket "number" \(source\) is incompatible with "string" \(target\)/);
  });

  it('addEdge 重复 ID 抛错', () => {
    const g = newGraph();
    const A = portNode('A');
    const B = portNode('B');
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
    const A = portNode('A');
    const B = portNode('B');
    const C = portNode('C');
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
    const A = portNode('A');
    g.addNode(A);
    g.addEdge(new Edge(id<EdgeId>('self'),
      new Endpoint(A, A.output('y')!),
      new Endpoint(A, A.input('x')!)));
    expect(g.edgeCount()).toBe(1);
    expect(g.removeNode(id<NodeId>('A'))).toBeDefined();
    expect(g.edgeCount()).toBe(0);
  });

  it('findEdge / endpoints / between / connecting', () => {
    const g = newGraph();
    const A = portNode('A');
    const B = portNode('B');
    g.addNode(A).addNode(B);
    g.addEdge(new Edge(id<EdgeId>('e1'), new Endpoint(A, A.output('y')!), new Endpoint(B, B.input('x')!)));
    g.addEdge(new Edge(id<EdgeId>('e2'), new Endpoint(B, B.output('y')!), new Endpoint(A, A.input('x')!)));

    expect(g.findEdge(id<NodeId>('A'), id<NodeId>('B'))?.id).toBe('e1');
    expect(g.findEdge(id<NodeId>('A'), id<NodeId>('Missing'))).toBeUndefined();
    expect(g.endpoints(id<EdgeId>('e1'))).toEqual(['A', 'B']);
    expect(g.between(id<NodeId>('A'), id<NodeId>('B')).map(e => e.id)).toEqual(['e1']);
    expect(g.connecting(id<NodeId>('A'), id<NodeId>('B')).map(e => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('incident 包含入边与出边，自环只出现一次', () => {
    const g = newGraph();
    const A = portNode('A');
    const B = portNode('B');
    g.addNode(A).addNode(B);
    // A → B（A 出 / B 入）
    g.addEdge(new Edge(id<EdgeId>('e1'), new Endpoint(A, A.output('y')!), new Endpoint(B, B.input('x')!)));
    // B → A（A 入 / B 出）
    g.addEdge(new Edge(id<EdgeId>('e2'), new Endpoint(B, B.output('y')!), new Endpoint(A, A.input('x')!)));
    // A 上的自环（A 出 + A 入，去重后应只出现一次）
    g.addEdge(new Edge(id<EdgeId>('loop'), new Endpoint(A, A.output('y')!), new Endpoint(A, A.input('x')!)));

    expect(g.incident(id<NodeId>('A')).map(e => e.id).sort()).toEqual(['e1', 'e2', 'loop']);
    expect(g.incident(id<NodeId>('B')).map(e => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('predecessors / successors / adjacencies / degree', () => {
    const g = newGraph();
    const A = portNode('A');
    const B = portNode('B');
    const C = portNode('C');
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
    const A = portNode('A');
    const B = portNode('B');
    const C = portNode('C'); // 孤立
    g.addNode(A).addNode(B).addNode(C);
    g.addEdge(new Edge(id<EdgeId>('e1'), new Endpoint(A, A.output('y')!), new Endpoint(B, B.input('x')!)));

    expect(sources(g).sort()).toEqual(['A', 'C']);
    expect(sinks(g).sort()).toEqual(['B', 'C']);
    expect(isolated(g)).toEqual(['C']);
  });

  it('clear / empty', () => {
    const g = newGraph();
    expect(g.empty()).toBe(true);
    g.addNode(portNode('A'));
    expect(g.empty()).toBe(false);
    g.clear();
    expect(g.empty()).toBe(true);
    expect(g.nodeCount()).toBe(0);
    expect(g.edgeCount()).toBe(0);
  });

  it('toJson 输出可被 JSON.stringify 序列化', () => {
    const g = newGraph();
    g.addNode(portNode('A'));
    const snapshot = g.toJson();
    expect(snapshot.id).toBe('g');
    expect(Array.isArray(snapshot.nodes)).toBe(true);
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

  it('NodeIndexable: bound / at / indexOf', () => {
    const g = newGraph();
    g.addNode(portNode('A')).addNode(portNode('B'));
    expect(g.bound()).toBe(2);
    expect(g.at(0)).toBe('A');
    expect(g.at(1)).toBe('B');
    expect(g.at(99)).toBeUndefined();
    expect(g.indexOf(id<NodeId>('B'))).toBe(1);
    expect(g.indexOf(id<NodeId>('missing'))).toBe(-1);
  });

  it('Visitable: marks / reset', () => {
    const g = newGraph();
    g.addNode(portNode('A'));
    g.addNode(portNode('B'));
    const m = g.marks();
    expect(m.size).toBe(2);
    expect([...m.values()]).toEqual([false, false]);
    m.set(id<NodeId>('A'), true);
    g.reset(m);
    expect([...m.values()]).toEqual([false, false]);
  });
});
