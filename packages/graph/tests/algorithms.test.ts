/**
 * 测试覆盖：`./algorithms` 中的拓扑、SCC、DFS/BFS、Dijkstra、可达性、缩点等。
 */
import { describe, expect, it } from 'vitest';

import {
  ancestors,
  bfs,
  condensation,
  CycleError,
  cycles,
  degrees,
  descendants,
  dfs,
  dijkstra,
  isCyclic,
  isolated,
  kosaraju,
  neighborhood,
  postorder,
  ranks,
  reachable,
  scc,
  sinks,
  sources,
  toposort,
  topology,
  weighted,
  type NodeId,
} from '../core';
import { buildGraph, id } from './_fixtures';

const linear = () => buildGraph('lin', [
  ['a', 'b', 1],
  ['b', 'c', 2],
  ['c', 'd', 3],
]);

const diamond = () => buildGraph('dmd', [
  ['a', 'b', 1],
  ['a', 'c', 4],
  ['b', 'd', 2],
  ['c', 'd', 1],
]);

const cycle3 = () => buildGraph('cy3', [
  ['x', 'y'],
  ['y', 'z'],
  ['z', 'x'],
]);

describe('toposort', () => {
  it('线性 DAG 返回稳定顺序', () => {
    expect(toposort(linear())).toEqual(['a', 'b', 'c', 'd']);
  });

  it('菱形 DAG: a 在 b/c 前，d 在最后', () => {
    const order = toposort(diamond());
    expect(order[0]).toBe(id<NodeId>('a'));
    expect(order[order.length - 1]).toBe(id<NodeId>('d'));
    expect(order.indexOf(id<NodeId>('b'))).toBeLessThan(order.indexOf(id<NodeId>('d')));
    expect(order.indexOf(id<NodeId>('c'))).toBeLessThan(order.indexOf(id<NodeId>('d')));
  });

  it('环图默认抛出 CycleError', () => {
    expect(() => toposort(cycle3())).toThrowError(CycleError);
    try {
      toposort(cycle3());
    } catch (e) {
      expect(e).toBeInstanceOf(CycleError);
      expect((e as CycleError).cycleNodes.sort()).toEqual(['x', 'y', 'z']);
    }
  });

  it('自定义 onCycle 可压制错误并附加环上节点', () => {
    const order = toposort(cycle3(), (cycle) => cycle);
    expect(order.sort()).toEqual(['x', 'y', 'z']);
  });

  // 1.1 回归：topology 不应把 outgoingNeighbors 返回的孤儿节点纳入 order
  it('1.1 fix: outgoingNeighbors 返回的孤儿节点不会污染 order', () => {
    const g = buildGraph('orphan', [], ['a', 'b']);
    const real = g.outgoingNeighbors.bind(g);
    (g as unknown as { outgoingNeighbors: typeof g.outgoingNeighbors }).outgoingNeighbors =
      function* (n: NodeId) {
        yield* real(n);
        if (n === 'a') yield id<NodeId>('ghost');
      };
    const result = topology(g);
    expect(result.order.includes(id<NodeId>('ghost'))).toBe(false);
    expect(result.order.sort()).toEqual(['a', 'b']);
    expect(result.cycles.hasCycle).toBe(false);
  });
});

describe('cycles / isCyclic', () => {
  it('DAG 无环', () => {
    expect(cycles(linear()).hasCycle).toBe(false);
    expect(isCyclic(linear())).toBe(false);
  });

  it('环图返回环上节点', () => {
    const c = cycles(cycle3());
    expect(c.hasCycle).toBe(true);
    expect(c.cycleNodes.sort()).toEqual(['x', 'y', 'z']);
    expect(isCyclic(cycle3())).toBe(true);
  });
});

describe('scc / kosaraju', () => {
  it('无环图：每个节点自成一个分量', () => {
    const components = scc(linear()).map(c => c.sort());
    expect(components.length).toBe(4);
    expect(components.flat().sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('单环图：所有节点是一个分量', () => {
    const components = scc(cycle3()).map(c => c.sort());
    expect(components).toEqual([['x', 'y', 'z']]);
  });

  it('双环 + 桥：每个环各一个分量', () => {
    const g = buildGraph('two', [
      // 环 1: a → b → a
      ['a', 'b'],
      ['b', 'a'],
      // 桥 b → c
      ['b', 'c'],
      // 环 2: c → d → c
      ['c', 'd'],
      ['d', 'c'],
    ]);
    const sets = scc(g).map(c => c.sort());
    expect(sets.length).toBe(2);
    expect(sets.flat().sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('kosaraju 与 scc 在划分上一致', () => {
    const norm = (cs: NodeId[][]) => cs.map(c => [...c].sort()).map(c => c.join(',')).sort();
    const g = buildGraph('mix', [
      ['a', 'b'],
      ['b', 'a'],
      ['b', 'c'],
    ]);
    expect(norm(scc(g))).toEqual(norm(kosaraju(g)));
  });
});

describe('dfs / bfs', () => {
  it('dfs 按出邻居顺序压栈', () => {
    expect([...dfs(diamond(), id<NodeId>('a'))]).toEqual(['a', 'b', 'd', 'c']);
  });

  it('bfs 按层次推进', () => {
    expect([...bfs(diamond(), id<NodeId>('a'))]).toEqual(['a', 'b', 'c', 'd']);
  });

  it('从孤立节点出发只产出自身', () => {
    const g = buildGraph('s', [], ['only']);
    expect([...dfs(g, id<NodeId>('only'))]).toEqual(['only']);
    expect([...bfs(g, id<NodeId>('only'))]).toEqual(['only']);
  });
});

describe('reachable / ancestors / descendants', () => {
  it('reachable 顺向 DAG 正确', () => {
    expect(reachable(diamond(), id<NodeId>('a'), id<NodeId>('d'))).toBe(true);
    expect(reachable(diamond(), id<NodeId>('d'), id<NodeId>('a'))).toBe(false);
    expect(reachable(diamond(), id<NodeId>('a'), id<NodeId>('a'))).toBe(true);
  });

  it('ancestors 通过反向视图复用 DFS', () => {
    expect(ancestors(diamond(), id<NodeId>('d')).sort()).toEqual(['a', 'b', 'c']);
    expect(ancestors(diamond(), id<NodeId>('a'))).toEqual([]);
  });

  it('descendants 遵循出边', () => {
    expect(descendants(diamond(), id<NodeId>('a')).sort()).toEqual(['b', 'c', 'd']);
    expect(descendants(diamond(), id<NodeId>('d'))).toEqual([]);
  });
});

describe('postorder', () => {
  it('finish 顺序：叶子先于内部节点', () => {
    expect(postorder(diamond(), [id<NodeId>('a')])).toEqual(['d', 'b', 'c', 'a']);
  });

  it('未指定起点则全图扫描', () => {
    const order = postorder(linear());
    expect(order).toContain('a');
    expect(order).toContain('d');
    expect(order.length).toBe(4);
  });
});

describe('ranks', () => {
  it('返回 nodeId → 拓扑序中位置', () => {
    const r = ranks(linear());
    expect(r.get(id<NodeId>('a'))).toBe(0);
    expect(r.get(id<NodeId>('d'))).toBe(3);
  });
});

describe('degrees / sources / sinks / isolated', () => {
  it('degrees 正确计入/出度', () => {
    const d = degrees(diamond());
    expect(d.get(id<NodeId>('a'))).toEqual({ inDegree: 0, outDegree: 2 });
    expect(d.get(id<NodeId>('d'))).toEqual({ inDegree: 2, outDegree: 0 });
    expect(d.get(id<NodeId>('b'))).toEqual({ inDegree: 1, outDegree: 1 });
  });

  it('sources / sinks / isolated 在算法层正确返回 NodeId[]', () => {
    const g = buildGraph('mixed', [['a', 'b']], ['lonely']);
    expect(sources(g).sort()).toEqual(['a', 'lonely']);
    expect(sinks(g).sort()).toEqual(['b', 'lonely']);
    expect(isolated(g)).toEqual(['lonely']);
  });
});

describe('neighborhood', () => {
  it('一次扫描即可同时得到 predecessors / successors', () => {
    const map = neighborhood(diamond());
    expect(map.get(id<NodeId>('d'))?.predecessors.sort()).toEqual(['b', 'c']);
    expect(map.get(id<NodeId>('a'))?.successors.sort()).toEqual(['b', 'c']);
    expect(map.get(id<NodeId>('a'))?.predecessors).toEqual([]);
  });
});

describe('condensation', () => {
  it('SCC 被合并为超节点，得到 DAG 描述', () => {
    const g = buildGraph('cond', [
      ['a', 'b'],
      ['b', 'a'], // a/b 同一 SCC
      ['b', 'c'],
    ]);
    const out = condensation(g);
    expect(out.components.length).toBe(2);
    expect(out.edges).toEqual([
      { from: out.index.get(id<NodeId>('a'))!, to: out.index.get(id<NodeId>('c'))! },
    ]);
  });

  it('单环图 condensation 边为空', () => {
    expect(condensation(cycle3()).edges).toEqual([]);
  });
});

describe('dijkstra', () => {
  it('线性图返回累计距离', () => {
    const dist = dijkstra(linear(), id<NodeId>('a'), undefined, e => (e.weight as number) ?? 0);
    expect(dist.get(id<NodeId>('a'))).toBe(0);
    expect(dist.get(id<NodeId>('b'))).toBe(1);
    expect(dist.get(id<NodeId>('c'))).toBe(3);
    expect(dist.get(id<NodeId>('d'))).toBe(6);
  });

  it('菱形图选最短路径', () => {
    const dist = dijkstra(diamond(), id<NodeId>('a'), undefined, e => (e.weight as number) ?? 0);
    // a→b(1)→d(2)=3 vs a→c(4)→d(1)=5
    expect(dist.get(id<NodeId>('d'))).toBe(3);
  });

  it('指定 end 时提前终止仍返回正确距离', () => {
    const dist = dijkstra(diamond(), id<NodeId>('a'), id<NodeId>('d'), e => (e.weight as number) ?? 0);
    expect(dist.get(id<NodeId>('d'))).toBe(3);
  });

  it('不可达节点不在 distances 中', () => {
    const g = buildGraph('disc', [['a', 'b', 1]], ['island']);
    const dist = dijkstra(g, id<NodeId>('a'), undefined, e => (e.weight as number) ?? 0);
    expect(dist.has(id<NodeId>('island'))).toBe(false);
  });
});

describe('weighted helper', () => {
  it('为缺省 weight 填默认值', () => {
    const ref = { id: 'e' as never, source: 'a' as NodeId, target: 'b' as NodeId, weight: undefined };
    expect(weighted(ref, 1).weight).toBe(1);
    const ref2 = { ...ref, weight: 5 };
    expect(weighted(ref2, 999).weight).toBe(5);
  });
});
