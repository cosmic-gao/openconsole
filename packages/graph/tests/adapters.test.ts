/**
 * 测试覆盖：`./adapters` 中的 Reversed / NodeFiltered / EdgeFiltered 视图。
 */
import { describe, expect, it } from 'vitest';

import { EdgeFiltered, NodeFiltered, Reversed, MapGraph, reversed, dfs, toposort, type EdgeId, type GraphId, type NodeId } from '../core';

const id = <T extends string>(v: string) => v as unknown as T;

const linear = () => MapGraph.from(id<GraphId>('lin'), [
  [id<NodeId>('a'), id<NodeId>('b'), 1],
  [id<NodeId>('b'), id<NodeId>('c'), 2],
  [id<NodeId>('c'), id<NodeId>('d'), 3],
]);

describe('Reversed', () => {
  it('outgoingNeighbors / incomingNeighbors 互换', () => {
    const r = reversed(linear());
    expect([...r.outgoingNeighbors(id<NodeId>('b'))]).toEqual(['a']);
    expect([...r.incomingNeighbors(id<NodeId>('b'))]).toEqual(['c']);
  });

  it('inDegree / outDegree 互换', () => {
    const r = reversed(linear());
    expect(r.inDegree(id<NodeId>('a'))).toBe(1);  // 反向后 a 有一个入边
    expect(r.outDegree(id<NodeId>('a'))).toBe(0); // 反向后 a 没有出边
    expect(r.inDegree(id<NodeId>('d'))).toBe(0);
    expect(r.outDegree(id<NodeId>('d'))).toBe(1);
  });

  // 1.3 回归：inner 缺 IntoDegree 时通过 neighbors 回退计数
  it('1.3 fix: inner 缺 IntoDegree 时 inDegree/outDegree 通过 neighbors 回退而非返回 0', () => {
    const stub = {
      nodeIds: [id<NodeId>('a'), id<NodeId>('b'), id<NodeId>('c')] as Iterable<NodeId>,
      edgeIds: [] as Iterable<EdgeId>,
      nodeCount: () => 3,
      edgeCount: () => 0,
      neighbors: function* (_n: NodeId): Iterable<NodeId> { /* empty */ },
      incomingNeighbors: function* (n: NodeId): Iterable<NodeId> {
        if (n === 'b') yield id<NodeId>('a');
      },
      outgoingNeighbors: function* (n: NodeId): Iterable<NodeId> {
        if (n === 'a') { yield id<NodeId>('b'); yield id<NodeId>('c'); }
      },
    };
    const r = new Reversed(stub);
    expect(r.inDegree(id<NodeId>('a'))).toBe(2);  // 原图 a 出度 2
    expect(r.outDegree(id<NodeId>('b'))).toBe(1); // 原图 b 入度 1
  });

  it('getEdges 翻转 source / target', () => {
    const r = reversed(linear());
    const refs = [...r.getEdges()].map(ref => `${ref.source}→${ref.target}`).sort();
    expect(refs).toEqual(['b→a', 'c→b', 'd→c']);
  });

  it('与 dfs 组合：得到 ancestors 风格的反向遍历', () => {
    expect([...dfs(reversed(linear()), id<NodeId>('d'))]).toEqual(['d', 'c', 'b', 'a']);
  });

  it('与 toposort 组合：反向 DAG 的拓扑序', () => {
    expect(toposort(reversed(linear()))).toEqual(['d', 'c', 'b', 'a']);
  });

  it('NodeIndexable 透传 inner 的 bound / at / indexOf', () => {
    const inner = linear();
    const r = reversed(inner);
    expect(r.bound()).toBe(inner.bound());
    expect(r.at(0)).toBe(inner.at(0));
    expect(r.indexOf(id<NodeId>('c'))).toBe(inner.indexOf(id<NodeId>('c')));
  });
});

describe('NodeFiltered', () => {
  const filtered = (preds: ReadonlySet<string>) =>
    new NodeFiltered(linear(), (id) => preds.has(id as unknown as string));

  it('nodeIds / nodeCount / edgeIds / edgeCount 跳过被隐去节点', () => {
    const view = filtered(new Set(['a', 'b', 'c'])); // d 隐去
    expect([...view.nodeIds].sort()).toEqual(['a', 'b', 'c']);
    expect(view.nodeCount()).toBe(3);
    expect([...view.edgeIds].sort()).toEqual(['e0', 'e1']); // c→d 被剔除
    expect(view.edgeCount()).toBe(2);
  });

  it('outgoingNeighbors / incomingNeighbors 滤掉隐去节点', () => {
    const view = filtered(new Set(['a', 'c', 'd'])); // b 隐去
    expect([...view.outgoingNeighbors(id<NodeId>('a'))]).toEqual([]);
    expect([...view.incomingNeighbors(id<NodeId>('c'))]).toEqual([]);
  });

  it('被隐去节点出发查询 returns empty', () => {
    const view = filtered(new Set(['a']));
    expect([...view.outgoingNeighbors(id<NodeId>('b'))]).toEqual([]);
    expect([...view.neighbors(id<NodeId>('b'))]).toEqual([]);
  });

  // 1.2 回归：inner 缺 getEdges 时 edgeIds 应返回空而非泄漏未过滤序列
  it('1.2 fix: inner 缺 getEdges 时 edgeIds 返回空（避免泄漏未过滤的 inner.edgeIds）', () => {
    const stub = {
      nodeIds: [id<NodeId>('a'), id<NodeId>('b')] as Iterable<NodeId>,
      edgeIds: [id<EdgeId>('leaked1'), id<EdgeId>('leaked2')] as Iterable<EdgeId>,
      nodeCount: () => 2,
      edgeCount: () => 2,
      neighbors: function* (_n: NodeId): Iterable<NodeId> { /* empty */ },
      incomingNeighbors: function* (_n: NodeId): Iterable<NodeId> { /* empty */ },
      outgoingNeighbors: function* (_n: NodeId): Iterable<NodeId> { /* empty */ },
    };
    const view = new NodeFiltered(stub, () => true);
    expect([...view.edgeIds]).toEqual([]);
  });

  it('与 toposort 组合得到子图拓扑序', () => {
    const view = filtered(new Set(['a', 'b', 'c']));
    expect(toposort(view)).toEqual(['a', 'b', 'c']);
  });
});

describe('EdgeFiltered', () => {
  it('节点不变；getEdges 按谓词过滤', () => {
    const inner = linear();
    const view = new EdgeFiltered(inner, ref => (ref.weight as number) >= 2);
    expect([...view.nodeIds].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(view.nodeCount()).toBe(4);
    const refs = [...view.getEdges()].map(r => `${r.source}→${r.target}`);
    expect(refs.sort()).toEqual(['b→c', 'c→d']);
    expect(view.edgeCount()).toBe(2);
  });

  it('outgoingNeighbors / incomingNeighbors 反映过滤后的边', () => {
    const view = new EdgeFiltered(linear(), ref => (ref.weight as number) >= 2);
    expect([...view.outgoingNeighbors(id<NodeId>('a'))]).toEqual([]); // a→b 被过滤
    expect([...view.incomingNeighbors(id<NodeId>('c'))]).toEqual(['b']);
  });

  it('neighbors(direction): direction undefined 同时返回 in + out', () => {
    const view = new EdgeFiltered(linear(), () => true);
    const all = [...view.neighbors(id<NodeId>('b'))].sort();
    expect(all).toEqual(['a', 'c']);
  });

  it('与 dfs 组合：滤掉不感兴趣的边后再遍历', () => {
    const view = new EdgeFiltered(linear(), ref => (ref.weight as number) >= 2);
    // 从 a 出发 a→b 被过滤，故只产出 a 自身
    expect([...dfs(view, id<NodeId>('a'))]).toEqual(['a']);
  });
});

describe('适配器嵌套', () => {
  it('reversed(NodeFiltered(g)) 仍是 GraphView-兼容的视图', () => {
    const filtered = new NodeFiltered(linear(), id => id !== 'd');
    const view = reversed(filtered);
    expect([...view.nodeIds].sort()).toEqual(['a', 'b', 'c']);
    expect([...view.outgoingNeighbors(id<NodeId>('c'))]).toEqual(['b']);
  });
});
