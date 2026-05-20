/**
 * 测试覆盖：packRemap / unpackRemap — 拓扑稳定 ID 重映射的紧凑序列化。
 */
import { describe, expect, it } from 'vitest';

import {
  Edge,
  Endpoint,
  Graph,
  Vertex,
  packRemap,
  Socket,
  unpackRemap,
  type EdgeId,
  type GraphId,
  type NodeId,
  type Sockets,
} from '../../core';
import { id } from '../_fixtures';

const makeNode = <T = unknown>(name: string, weight?: T) => {
  const n = new Vertex<Sockets, Sockets, T>(id<NodeId>(name), weight);
  n.addInput('x', Socket.number);
  n.addOutput('y', Socket.number);
  return n;
};

const makeChain = () => {
  const g = new Graph<{ kind: string }, number>(id<GraphId>('g'));
  const A = makeNode('node-very-long-id-A', { kind: 'src' });
  const B = makeNode('node-very-long-id-B', { kind: 'mid' });
  const C = makeNode('node-very-long-id-C', { kind: 'sink' });
  g.addNode(A).addNode(B).addNode(C);
  g.addEdge(new Edge(
    id<EdgeId>('edge-with-very-long-id-1'),
    new Endpoint(A, A.output('y')!),
    new Endpoint(B, B.input('x')!),
    10,
  ));
  g.addEdge(new Edge(
    id<EdgeId>('edge-with-very-long-id-2'),
    new Endpoint(B, B.output('y')!),
    new Endpoint(C, C.input('x')!),
    20,
  ));
  return g;
};

describe('packRemap', () => {
  it('节点 ID 按拓扑序换成 0..N-1 整数字符串', () => {
    const { compact, remap } = packRemap(makeChain());
    expect(compact.n.map(n => n[0])).toEqual(['0', '1', '2']);
    expect(remap.nodes).toEqual([
      'node-very-long-id-A',
      'node-very-long-id-B',
      'node-very-long-id-C',
    ]);
  });

  it('边 ID 重映射为整数字符串', () => {
    const { compact, remap } = packRemap(makeChain());
    expect(compact.e.map(e => e[0])).toEqual(['0', '1']);
    expect(remap.edges).toHaveLength(2);
    expect(remap.edges[0]).toBe('edge-with-very-long-id-1');
  });

  it('端口 ID 重映射为整数字符串', () => {
    const { compact, remap } = packRemap(makeChain());
    // 每节点 2 个端口 (x, y) × 3 节点 = 6 端口
    expect(remap.ports).toHaveLength(6);
    // 节点 0 的 inputs[0].portId 是 '0'
    const node0 = compact.n[0]!;
    const inputs = node0[2];
    expect(inputs?.[0]?.[1]).toBe('0');
  });

  it('压缩后字节明显变小（长 ID → 短整数）', () => {
    const g = makeChain();
    const originalJson = JSON.stringify(g.toJson());
    const remappedJson = JSON.stringify(packRemap(g));
    expect(remappedJson.length).toBeLessThan(originalJson.length);
  });
});

describe('unpackRemap', () => {
  it('round-trip 还原所有原始 ID', () => {
    const original = makeChain();
    const restored = unpackRemap<{ kind: string }, number>(packRemap(original));
    expect(restored.nodeCount()).toBe(3);
    expect(restored.hasNode(id<NodeId>('node-very-long-id-A'))).toBe(true);
    expect(restored.hasEdge(id<EdgeId>('edge-with-very-long-id-1'))).toBe(true);
    expect(restored.getEdge(id<EdgeId>('edge-with-very-long-id-1'))?.weight).toBe(10);
  });

  it('round-trip 后 toJson 结构与原图等价', () => {
    const original = makeChain();
    const restored = unpackRemap(packRemap(original));
    expect(restored.toJson()).toEqual(original.toJson());
  });

  it('keepCompactIds 选项：保留紧凑 ID 不还原', () => {
    const original = makeChain();
    const restored = unpackRemap(packRemap(original), { keepCompactIds: true });
    expect(restored.hasNode(id<NodeId>('0'))).toBe(true);
    expect(restored.hasNode(id<NodeId>('node-very-long-id-A'))).toBe(false);
  });

  it('target 选项：复用现有图', () => {
    const target = new Graph(id<GraphId>('placeholder'));
    target.addNode(makeNode('orphan'));
    const restored = unpackRemap(packRemap(makeChain()), { target });
    expect(restored).toBe(target);
    expect(restored.hasNode(id<NodeId>('orphan'))).toBe(false);
    expect(restored.nodeCount()).toBe(3);
  });

  it('环图：环上节点附加在末尾，仍可 round-trip', () => {
    const g = new Graph<unknown, unknown>(id<GraphId>('cy'));
    const X = makeNode('X');
    const Y = makeNode('Y');
    const Z = makeNode('Z');
    g.addNode(X).addNode(Y).addNode(Z);
    g.addEdge(new Edge(id<EdgeId>('xy'), new Endpoint(X, X.output('y')!), new Endpoint(Y, Y.input('x')!)));
    g.addEdge(new Edge(id<EdgeId>('yz'), new Endpoint(Y, Y.output('y')!), new Endpoint(Z, Z.input('x')!)));
    g.addEdge(new Edge(id<EdgeId>('zx'), new Endpoint(Z, Z.output('y')!), new Endpoint(X, X.input('x')!)));

    const restored = unpackRemap(packRemap(g));
    expect(restored.nodeCount()).toBe(3);
    expect(restored.edgeCount()).toBe(3);
  });
});
