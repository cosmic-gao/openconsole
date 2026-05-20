/**
 * 测试覆盖：IncrementalTopo — 订阅 Graph 事件维护拓扑序与环检测。
 */
import { describe, expect, it } from 'vitest';

import { IncrementalTopo, Vertex, type NodeId } from '../../core';
import { buildGraph, id } from '../_fixtures';

const diamond = () => buildGraph('dmd', [
  ['a', 'b'],
  ['a', 'c'],
  ['b', 'd'],
  ['c', 'd'],
]);

describe('IncrementalTopo', () => {
  it('初始 rank 与 toposort 一致', () => {
    const g = diamond();
    const topo = new IncrementalTopo(g);
    expect(topo.rank(id<NodeId>('a'))).toBe(0);
    expect(topo.rank(id<NodeId>('d'))).toBe(3);
    expect(topo.hasCycle).toBe(false);
    topo.dispose();
  });

  it('sorted() 返回拓扑顺序快照', () => {
    const topo = new IncrementalTopo(diamond());
    expect(topo.sorted()).toEqual(['a', 'b', 'c', 'd']);
    topo.dispose();
  });

  it('compare 返回 rank 差', () => {
    const topo = new IncrementalTopo(diamond());
    expect(topo.compare(id<NodeId>('a'), id<NodeId>('d'))).toBeLessThan(0);
    expect(topo.compare(id<NodeId>('d'), id<NodeId>('a'))).toBeGreaterThan(0);
    expect(topo.compare(id<NodeId>('a'), id<NodeId>('a'))).toBe(0);
    topo.dispose();
  });

  it('addNode 末尾追加 rank（happy path：无需重排）', () => {
    const g = diamond();
    const topo = new IncrementalTopo(g);
    const before = topo.sorted();
    expect(before).toEqual(['a', 'b', 'c', 'd']);

    // 加入孤立节点，应追加在末尾
    g.addNode(new Vertex(id<NodeId>('extra')));
    expect(topo.rank(id<NodeId>('extra'))).toBe(4);
    topo.dispose();
  });

  it('addEdge 不违反拓扑：rank 不变，无重算', () => {
    const g = buildGraph('lin', [
      ['a', 'b'],
      ['b', 'c'],
    ]);
    const topo = new IncrementalTopo(g);
    const aRank = topo.rank(id<NodeId>('a'));
    const cRank = topo.rank(id<NodeId>('c'));

    // 加边 a→c 不违反（a 在 c 前）
    g.connect([id<NodeId>('a'), 'y'], [id<NodeId>('c'), 'x']);
    expect(topo.rank(id<NodeId>('a'))).toBe(aRank);
    expect(topo.rank(id<NodeId>('c'))).toBe(cRank);
    expect(topo.hasCycle).toBe(false);
    topo.dispose();
  });

  it('addEdge 违反拓扑：dirty 触发重算并仍正确', () => {
    const g = buildGraph('lin', [
      ['a', 'b'],
      ['b', 'c'],
    ]);
    const topo = new IncrementalTopo(g);

    // 加 c→a 形成环
    g.connect([id<NodeId>('c'), 'y'], [id<NodeId>('a'), 'x']);
    expect(topo.hasCycle).toBe(true);
    expect([...topo.cycleNodes].sort()).toEqual(['a', 'b', 'c']);
    topo.dispose();
  });

  it('removeNode 删除 rank（不压紧 — gap 可接受）', () => {
    const g = diamond();
    const topo = new IncrementalTopo(g);
    g.removeNode(id<NodeId>('b'));
    expect(topo.rank(id<NodeId>('b'))).toBeUndefined();
    // a/c/d 还在
    expect(topo.rank(id<NodeId>('a'))).toBeDefined();
    expect(topo.rank(id<NodeId>('d'))).toBeDefined();
    topo.dispose();
  });

  it('removeEdge 在含环时触发重算（环可能被打破）', () => {
    const g = buildGraph('c3', [
      ['x', 'y'],
      ['y', 'z'],
      ['z', 'x'],
    ]);
    const topo = new IncrementalTopo(g);
    expect(topo.hasCycle).toBe(true);

    // 删一条环上的边
    const edge = g.findEdge(id<NodeId>('z'), id<NodeId>('x'));
    g.removeEdge(edge!.id);

    expect(topo.hasCycle).toBe(false);
    expect(topo.sorted()).toEqual(['x', 'y', 'z']);
    topo.dispose();
  });

  it('sync 立即重算', () => {
    const topo = new IncrementalTopo(diamond());
    topo.sync();
    expect(topo.rank(id<NodeId>('a'))).toBe(0);
    topo.dispose();
  });

  it('dispose 之后不再响应事件', () => {
    const g = diamond();
    const topo = new IncrementalTopo(g);
    topo.dispose();

    // 加节点不应影响 topo 内部状态
    g.addNode(new Vertex(id<NodeId>('ghost')));
    expect(topo.rank(id<NodeId>('ghost'))).toBeUndefined();
  });

  it('sorted() dense 快路径：连续 add 保持稠密、按 rank 直接填入', () => {
    const g = buildGraph('seq', [['a', 'b']]);
    const topo = new IncrementalTopo(g);

    // 连续追加孤立节点 — 始终稠密
    g.addNode(new Vertex(id<NodeId>('c')));
    g.addNode(new Vertex(id<NodeId>('d')));
    g.addNode(new Vertex(id<NodeId>('e')));

    // dense 路径走 new Array(size) + 按 rank 下标填入 — O(N)
    expect(topo.sorted()).toEqual(['a', 'b', 'c', 'd', 'e']);
    topo.dispose();
  });

  it('sorted() dense 边界：删末位 rank 仍保持稠密', () => {
    const g = buildGraph('seq', [['a', 'b']]);
    const topo = new IncrementalTopo(g);
    g.addNode(new Vertex(id<NodeId>('c')));
    expect(topo.sorted()).toEqual(['a', 'b', 'c']);

    // 删末位 c — _maxRank 应自动下降，dense=true 维持
    g.removeNode(id<NodeId>('c'));
    expect(topo.sorted()).toEqual(['a', 'b']);

    // 再 add d — 占用刚释放的 rank 槽位，仍稠密
    g.addNode(new Vertex(id<NodeId>('d')));
    expect(topo.sorted()).toEqual(['a', 'b', 'd']);
    topo.dispose();
  });

  it('sorted() sparse 路径：删中间 rank 退化为 sort', () => {
    const g = buildGraph('seq', [['a', 'b']]);
    const topo = new IncrementalTopo(g);
    g.addNode(new Vertex(id<NodeId>('c')));
    g.addNode(new Vertex(id<NodeId>('d')));

    // 删中间 b（rank=1）— 留空隙，dense=false
    g.removeNode(id<NodeId>('b'));

    // sparse 路径走 entries + sort — 仍正确
    expect(topo.sorted()).toEqual(['a', 'c', 'd']);
    topo.dispose();
  });
});
