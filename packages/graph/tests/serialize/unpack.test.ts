/**
 * 测试覆盖：unpack - 从紧凑格式恢复 Graph，支持自定义 Socket 表与目标图复用。
 */
import { describe, expect, it } from 'vitest';

import {
  Edge,
  Endpoint,
  Graph,
  Node,
  pack,
  Socket,
  unpack,
  type EdgeId,
  type GraphId,
  type NodeId,
  type PortId,
  type Sockets,
} from '../../core';
import { id } from '../_fixtures';

const makeNode = <T = unknown>(name: string, weight?: T) => {
  const n = new Node<Sockets, Sockets, T>(id<NodeId>(name), weight);
  n.addInput('x', Socket.number);
  n.addOutput('y', Socket.number);
  return n;
};

const makeGraph = () => {
  const g = new Graph<{ kind: string }, string>(id<GraphId>('g'));
  const A = makeNode<{ kind: string }>('A', { kind: 'src' });
  const B = makeNode<{ kind: string }>('B', { kind: 'sink' });
  g.addNode(A).addNode(B);
  g.addEdge(new Edge(
    id<EdgeId>('e1'),
    new Endpoint(A, A.output('y')!),
    new Endpoint(B, B.input('x')!),
    'edge-w',
  ));
  return g;
};

describe('unpack', () => {
  it('从 pack 输出恢复完整图', () => {
    const original = makeGraph();
    const restored = unpack<{ kind: string }, string>(pack(original));
    expect(restored.id).toBe('g');
    expect(restored.nodeCount()).toBe(2);
    expect(restored.edgeCount()).toBe(1);
    expect(restored.getNode(id<NodeId>('A'))?.weight).toEqual({ kind: 'src' });
    expect(restored.getEdge(id<EdgeId>('e1'))?.weight).toBe('edge-w');
  });

  it('恢复的图保留 socket 类型并通过 _validate', () => {
    const restored = unpack<{ kind: string }, string>(pack(makeGraph()));
    const A = restored.getNode(id<NodeId>('A'))!;
    expect(A.output('y')?.socket).toBe(Socket.number);
  });

  it('target 选项：清空已有图后加载', () => {
    const target = new Graph<unknown, unknown>(id<GraphId>('placeholder'));
    target.addNode(new Node(id<NodeId>('orphan')));
    const original = makeGraph();
    const restored = unpack(pack(original), { target });
    expect(restored).toBe(target);
    expect(restored.hasNode(id<NodeId>('orphan'))).toBe(false);
    expect(restored.nodeCount()).toBe(2);
  });

  it('引用未知节点的边抛错', () => {
    const original = makeGraph();
    const packed = pack(original);
    packed.e[0]![1] = id<NodeId>('missing');
    expect(() => unpack(packed)).toThrow(/references missing nodes/);
  });

  it('引用未知端口的边抛错', () => {
    const original = makeGraph();
    const packed = pack(original);
    packed.e[0]![2] = id<PortId>('missing-port');
    expect(() => unpack(packed)).toThrow(/references missing ports/);
  });

  it('自定义 sockets 表覆盖内置类型', () => {
    const customNumber = Socket.from('number');
    const original = makeGraph();
    const restored = unpack(pack(original), { sockets: [customNumber] });
    const A = restored.getNode(id<NodeId>('A'))!;
    expect(A.output('y')?.socket).toBe(customNumber);
  });

  it('unknown socket 名退化为 Socket.any', () => {
    const original = new Graph<unknown, unknown>(id<GraphId>('g'));
    const N = new Node(id<NodeId>('N'));
    N.addInput('p', Socket.from('foo'));
    original.addNode(N);
    const restored = unpack(pack(original));
    expect(restored.getNode(id<NodeId>('N'))?.input('p')?.socket).toBe(Socket.any);
  });

  it('round-trip 后 toJson 等价（结构稳定）', () => {
    const original = makeGraph();
    const restored = unpack(pack(original));
    expect(restored.toJson()).toEqual(original.toJson());
  });
});
