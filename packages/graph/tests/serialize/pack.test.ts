/**
 * 测试覆盖：pack - 将 Graph 压缩为紧凑数组元组格式。
 */
import { describe, expect, it } from 'vitest';

import {
  Edge,
  Endpoint,
  Graph,
  Vertex,
  pack,
  Socket,
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

describe('pack', () => {
  it('生成 g/n/e 三字段紧凑结构', () => {
    const packed = pack(makeGraph());
    expect(packed.g).toBe('g');
    expect(packed.n).toHaveLength(2);
    expect(packed.e).toHaveLength(1);
  });

  it('节点元组形式 [id, weight, inputs, outputs]', () => {
    const packed = pack(makeGraph());
    const [nid, weight, inputs, outputs] = packed.n[0]!;
    expect(nid).toBe('A');
    expect(weight).toEqual({ kind: 'src' });
    expect(inputs).toEqual([['x', 'A:input:x', 'number']]);
    expect(outputs).toEqual([['y', 'A:output:y', 'number']]);
  });

  it('边元组形式 [id, sourceNode, sourcePort, targetNode, targetPort, weight]', () => {
    const packed = pack(makeGraph());
    const [eid, sNode, sPort, tNode, tPort, weight] = packed.e[0]!;
    expect(eid).toBe('e1');
    expect(sNode).toBe('A');
    expect(sPort).toBe('A:output:y');
    expect(tNode).toBe('B');
    expect(tPort).toBe('B:input:x');
    expect(weight).toBe('edge-w');
  });

  it('无端口的节点 inputs / outputs 字段为 null（节省字节）', () => {
    const g = new Graph<unknown, unknown>(id<GraphId>('g'));
    g.addNode(new Vertex<Sockets, Sockets>(id<NodeId>('bare')));
    const packed = pack(g);
    expect(packed.n[0]).toEqual(['bare', undefined, null, null]);
  });
});
