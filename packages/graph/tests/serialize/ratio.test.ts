/**
 * 测试覆盖：compressionRatio - 评估紧凑格式相对 toJson() 的字节压缩比。
 */
import { describe, expect, it } from 'vitest';

import {
  compressionRatio,
  Edge,
  Endpoint,
  Graph,
  Node,
  Socket,
  type EdgeId,
  type GraphId,
  type NodeId,
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

describe('compressionRatio', () => {
  it('紧凑格式比 JSON 形式更小', () => {
    const g = makeGraph();
    const r = compressionRatio(g);
    expect(r.originalBytes).toBeGreaterThan(r.compressedBytes);
    expect(r.ratio).toBeGreaterThan(1);
  });

  it('空图 ratio 仍然合理（不为 0）', () => {
    const g = new Graph<unknown, unknown>(id<GraphId>('empty'));
    const r = compressionRatio(g);
    expect(r.compressedBytes).toBeGreaterThan(0);
    expect(r.ratio).toBeGreaterThan(0);
  });

  it('UTF-8 多字节字符长度准确', () => {
    const g = new Graph<string, unknown>(id<GraphId>('emoji'));
    g.addNode(new Node(id<NodeId>('节点-🎉'), '中文节点权重 🚀'));
    const r = compressionRatio(g);
    expect(r.compressedBytes).toBeGreaterThan(0);
    expect(Number.isFinite(r.ratio)).toBe(true);
  });
});
