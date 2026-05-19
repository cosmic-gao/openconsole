/**
 * 测试覆盖：diff / apply / invert — 图的结构差异与撤销重做。
 */
import { describe, expect, it } from 'vitest';

import {
  apply,
  diff,
  Edge,
  Endpoint,
  Graph,
  invert,
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

const makeBase = () => {
  const g = new Graph<{ kind: string }, number>(id<GraphId>('g'));
  const A = makeNode('A', { kind: 'src' });
  const B = makeNode('B', { kind: 'sink' });
  g.addNode(A).addNode(B);
  g.addEdge(new Edge(
    id<EdgeId>('e1'),
    new Endpoint(A, A.output('y')!),
    new Endpoint(B, B.input('x')!),
    1,
  ));
  return g;
};

const makeExtended = () => {
  const g = makeBase();
  const C = makeNode('C', { kind: 'mid' });
  g.addNode(C);
  g.addEdge(new Edge(
    id<EdgeId>('e2'),
    new Endpoint(g.getNode(id<NodeId>('A'))!, g.getNode(id<NodeId>('A'))!.output('y')!),
    new Endpoint(C, C.input('x')!),
    2,
  ));
  return g;
};

describe('diff', () => {
  it('相同图 → 空 patch', () => {
    const patch = diff(makeBase(), makeBase());
    expect(patch.ops).toEqual([]);
  });

  it('after 多了一个节点和一条边 → addNode + addEdge ops', () => {
    const patch = diff(makeBase(), makeExtended());
    const kinds = patch.ops.map(o => o.kind);
    expect(kinds).toContain('addNode');
    expect(kinds).toContain('addEdge');
  });

  it('after 少了一个节点 → removeEdge 先于 removeNode', () => {
    const patch = diff(makeExtended(), makeBase());
    const kinds = patch.ops.map(o => o.kind);
    const removeEdgeIdx = kinds.indexOf('removeEdge');
    const removeNodeIdx = kinds.indexOf('removeNode');
    expect(removeEdgeIdx).toBeGreaterThanOrEqual(0);
    expect(removeNodeIdx).toBeGreaterThan(removeEdgeIdx);
  });

  it('权重变化 → setNodeWeight / setEdgeWeight', () => {
    const before = makeBase();
    const after = makeBase();
    after.getNode(id<NodeId>('A'))!.weight = { kind: 'changed' };
    after.getEdge(id<EdgeId>('e1'))!.weight = 99;

    const patch = diff(before, after);
    const setNode = patch.ops.find(o => o.kind === 'setNodeWeight');
    const setEdge = patch.ops.find(o => o.kind === 'setEdgeWeight');
    expect(setNode).toBeDefined();
    expect(setEdge).toBeDefined();
    expect((setNode as { kind: 'setNodeWeight'; to: unknown }).to).toEqual({ kind: 'changed' });
    expect((setEdge as { kind: 'setEdgeWeight'; to: unknown }).to).toBe(99);
  });
});

describe('apply', () => {
  it('应用 diff(base, ext) 把 base 变为 ext', () => {
    const base = makeBase();
    const ext = makeExtended();
    const patch = diff(base, ext);
    apply(base, patch);
    expect(base.nodeCount()).toBe(ext.nodeCount());
    expect(base.edgeCount()).toBe(ext.edgeCount());
    expect(base.hasNode(id<NodeId>('C'))).toBe(true);
    expect(base.hasEdge(id<EdgeId>('e2'))).toBe(true);
  });

  it('apply 空 patch 不修改图', () => {
    const base = makeBase();
    const before = { nodes: base.nodeCount(), edges: base.edgeCount() };
    apply(base, { ops: [] });
    expect(base.nodeCount()).toBe(before.nodes);
    expect(base.edgeCount()).toBe(before.edges);
  });

  it('apply 触发标准 Graph 事件', () => {
    const base = makeBase();
    const ext = makeExtended();
    const events: string[] = [];
    base.on('nodeAdded', ({ node }) => events.push(`+n:${node.id}`));
    base.on('edgeAdded', ({ edge }) => events.push(`+e:${edge.id}`));
    apply(base, diff(base, ext));
    expect(events).toContain('+n:C');
    expect(events).toContain('+e:e2');
  });
});

describe('invert', () => {
  it('invert(diff(a, b)) 把 b 变回 a', () => {
    const a = makeBase();
    const b = makeExtended();
    const forward = diff(a, b);
    const backward = invert(forward);

    // apply forward 到 a 变成 b
    apply(a, forward);
    expect(a.nodeCount()).toBe(b.nodeCount());

    // apply backward 把 a 变回 makeBase
    apply(a, backward);
    expect(a.nodeCount()).toBe(makeBase().nodeCount());
    expect(a.hasNode(id<NodeId>('C'))).toBe(false);
    expect(a.hasEdge(id<EdgeId>('e2'))).toBe(false);
  });

  it('invert 翻转 add ↔ remove 及 weight from/to', () => {
    const a = makeBase();
    const b = makeBase();
    b.getNode(id<NodeId>('A'))!.weight = { kind: 'changed' };

    const forward = diff(a, b);
    const backward = invert(forward);
    const setWeight = backward.ops.find(o => o.kind === 'setNodeWeight');
    expect(setWeight).toBeDefined();
    expect((setWeight as { kind: 'setNodeWeight'; to: unknown }).to).toEqual({ kind: 'src' });
  });

  it('round-trip：apply(graph, diff(a,b)); apply(graph, invert(...)) 恢复 graph 到 a', () => {
    const original = makeBase();
    const target = makeExtended();
    const patch = diff(original, target);

    // 拷贝一份 original 做演示
    const live = makeBase();
    apply(live, patch);
    expect(live.hasNode(id<NodeId>('C'))).toBe(true);

    apply(live, invert(patch));
    expect(live.hasNode(id<NodeId>('C'))).toBe(false);
    expect(live.nodeCount()).toBe(2);
    expect(live.edgeCount()).toBe(1);
  });
});
