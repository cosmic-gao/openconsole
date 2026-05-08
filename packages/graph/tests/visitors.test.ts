/**
 * 测试覆盖：`./visitors` 中的状态化遍历器与事件回调 DFS。
 */
import { describe, expect, it, vi } from 'vitest';

import {
  Bfs,
  Dfs,
  DfsPostorder,
  dfsVisit,
  Topo,
  type Control,
  type DfsEvent,
  type NodeId,
} from '../core';
import { buildGraph, id } from './_fixtures';

const diamond = () => buildGraph('d', [
  ['a', 'b'],
  ['a', 'c'],
  ['b', 'd'],
  ['c', 'd'],
]);

const cycle3 = () => buildGraph('c3', [
  ['x', 'y'],
  ['y', 'z'],
  ['z', 'x'],
]);

const drain = <T>(iterable: Iterable<T>): T[] => [...iterable];

describe('Dfs', () => {
  it('next 推进；遍历完返回 undefined', () => {
    const g = diamond();
    const dfs = Dfs.start(g, id<NodeId>('a'));
    const result: NodeId[] = [];
    while (true) {
      const next = dfs.next(g);
      if (next === undefined) break;
      result.push(next);
    }
    expect(result).toEqual(['a', 'b', 'd', 'c']);
    expect(dfs.next(g)).toBeUndefined();
  });

  it('iterator 适配为可迭代对象', () => {
    const g = diamond();
    expect(drain(Dfs.start(g, id<NodeId>('a')).iterator(g))).toEqual(['a', 'b', 'd', 'c']);
  });

  it('moveTo 切换起点而不丢失 discovered', () => {
    const g = diamond();
    const dfs = Dfs.start(g, id<NodeId>('a'));
    expect(dfs.next(g)).toBe('a');
    dfs.moveTo(id<NodeId>('c'));
    // 已访问 a，从 c 出发：c 未访问 → c, d 已访问？ 实际 c 出 d → d 应入栈但 a 起点的子树并未走完，
    // discovered 集合保留 a，因此从 c 走会访问 c → d。
    const seq: NodeId[] = [];
    while (true) {
      const n = dfs.next(g);
      if (n === undefined) break;
      seq.push(n);
    }
    expect(seq).toEqual(['c', 'd']);
  });

  it('reset 清空全部状态', () => {
    const g = diamond();
    const dfs = Dfs.start(g, id<NodeId>('a'));
    dfs.next(g);
    dfs.reset();
    expect(dfs.discovered.size).toBe(0);
    expect(dfs.stack.length).toBe(0);
    expect(dfs.next(g)).toBeUndefined();
  });
});

describe('Bfs', () => {
  it('按层次推进', () => {
    const g = diamond();
    expect(drain(Bfs.start(g, id<NodeId>('a')).iterator(g))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('moveTo 重置队列与 visited', () => {
    const g = diamond();
    const bfs = Bfs.start(g, id<NodeId>('a'));
    drain(bfs.iterator(g));
    bfs.moveTo(id<NodeId>('c'));
    expect(drain(bfs.iterator(g))).toEqual(['c', 'd']);
  });
});

describe('DfsPostorder', () => {
  it('返回 finish 顺序：叶子先于内部', () => {
    const g = diamond();
    expect(drain(DfsPostorder.start(g, id<NodeId>('a')).iterator(g))).toEqual(['d', 'b', 'c', 'a']);
  });

  it('lazy 起点构造（new + next 才入栈）', () => {
    const g = diamond();
    const post = new DfsPostorder(id<NodeId>('a'));
    expect(post.stack.length).toBe(0); // 尚未消费
    const seq: NodeId[] = [];
    while (true) {
      const n = post.next(g);
      if (n === undefined) break;
      seq.push(n);
    }
    expect(seq).toEqual(['d', 'b', 'c', 'a']);
  });

  it('reset 清空全部', () => {
    const g = diamond();
    const post = DfsPostorder.start(g, id<NodeId>('a'));
    drain(post.iterator(g));
    post.reset();
    expect(post.discovered.size).toBe(0);
    expect(post.finished.size).toBe(0);
    expect(post.next(g)).toBeUndefined();
  });
});

describe('Topo', () => {
  it('drain 后 cycleNodes 为空', () => {
    const g = diamond();
    const topo = Topo.start(g);
    expect(drain(topo.iterator(g))).toEqual(['a', 'b', 'c', 'd']);
    expect(topo.cycleNodes()).toEqual([]);
  });

  it('环图：drain 出 0 个节点，cycleNodes 包含全部环节点', () => {
    const g = cycle3();
    const topo = Topo.start(g);
    expect(drain(topo.iterator(g))).toEqual([]);
    expect(topo.cycleNodes().sort()).toEqual(['x', 'y', 'z']);
  });

  it('collect 一次性 drain + 报告环', () => {
    const result = Topo.start(cycle3()).collect(cycle3());
    expect(result.cycles.hasCycle).toBe(true);
    expect(result.cycles.cycleNodes.length).toBe(3);
  });

  it('Topo 已防孤儿邻居（与 topology 1.1 修复同源）', () => {
    const g = buildGraph('orphan', [], ['a']);
    const real = g.outgoingNeighbors.bind(g);
    (g as unknown as { outgoingNeighbors: typeof g.outgoingNeighbors }).outgoingNeighbors =
      function* (n: NodeId) {
        yield* real(n);
        if (n === 'a') yield id<NodeId>('ghost');
      };
    const topo = Topo.start(g);
    const out: NodeId[] = drain(topo.iterator(g));
    expect(out).toEqual(['a']); // ghost 不应进入
  });
});

describe('dfsVisit', () => {
  it('discover/finish/treeEdge/backEdge/crossForwardEdge 分类正确', () => {
    const g = diamond(); // a→b, a→c, b→d, c→d
    const events: string[] = [];
    dfsVisit(g, [id<NodeId>('a')], {
      discover: e => { events.push(`d:${e.node}`); },
      finish: e => { events.push(`f:${e.node}`); },
      treeEdge: e => { events.push(`t:${e.node}->${e.target}`); },
      backEdge: e => { events.push(`b:${e.node}->${e.target}`); },
      crossForwardEdge: e => { events.push(`x:${e.node}->${e.target}`); },
    });
    expect(events.filter(e => e.startsWith('d:')).length).toBe(4); // 4 节点
    expect(events.filter(e => e.startsWith('f:')).length).toBe(4);
    expect(events.filter(e => e.startsWith('t:')).length).toBe(3); // a→b, b→d, a→c
    expect(events.filter(e => e.startsWith('b:')).length).toBe(0); // DAG 无后向边
    expect(events.filter(e => e.startsWith('x:')).length).toBe(1); // c→d (d 已 finish)
  });

  it('环图 → 至少一条 backEdge', () => {
    const events: string[] = [];
    dfsVisit(cycle3(), [id<NodeId>('x')], {
      backEdge: e => { events.push(`b:${e.node}->${e.target}`); },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('Control: prune 在 treeEdge 阻止下钻', () => {
    const g = diamond();
    const visited: NodeId[] = [];
    dfsVisit(g, [id<NodeId>('a')], {
      discover: e => { visited.push(e.node); },
      treeEdge: e => (e.target === 'b' ? 'prune' : 'continue') as Control,
    });
    expect(visited).toContain('a');
    expect(visited).not.toContain('b'); // 整个 b 子树被剪
    expect(visited).toContain('c');
  });

  it('Control: break 立即终止整次遍历', () => {
    const discoverFn = vi.fn<(e: DfsEvent) => Control>((e) => (e.node === 'b' ? 'break' : 'continue'));
    const result = dfsVisit(diamond(), [id<NodeId>('a')], { discover: discoverFn });
    expect(result).toBe('break');
    // 'break' 触发后不再 discover 任何新节点
    const discovered = discoverFn.mock.calls.map(c => c[0].node);
    expect(discovered).toEqual(['a', 'b']);
  });

  it('starts 为 null 时全图扫描', () => {
    const g = diamond();
    const visited: NodeId[] = [];
    dfsVisit(g, null, { discover: e => { visited.push(e.node); } });
    expect(visited.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('discover 返回 prune 立即 finish 当前节点', () => {
    const g = diamond();
    const finishOrder: NodeId[] = [];
    dfsVisit(g, [id<NodeId>('a')], {
      discover: e => (e.node === 'b' ? 'prune' : 'continue') as Control,
      finish: e => { finishOrder.push(e.node); },
    });
    // b 被 prune，应立即 finish；其后代 d 不入栈
    expect(finishOrder).toContain(id<NodeId>('b'));
    expect(finishOrder.indexOf(id<NodeId>('b'))).toBeLessThan(finishOrder.indexOf(id<NodeId>('a')));
  });
});
