/**
 * 测试覆盖：`./storages` 中的 MapGraph 与 MatrixGraph，以及 2.1 / 2.2 free-list 修复。
 */
import { describe, expect, it } from 'vitest';

import {
  MapGraph,
  MatrixGraph,
  type EdgeId,
  type GraphId,
  type NodeId,
} from '../core';

const id = <T extends string>(v: string) => v as unknown as T;

// ──────────────────────────────────────────────────────────────────────
// MapGraph
// ──────────────────────────────────────────────────────────────────────

describe('MapGraph 基础 CRUD', () => {
  it('addNode 幂等覆盖 weight；hasNode 准确', () => {
    const g = new MapGraph<string, unknown>(id<GraphId>('m'));
    g.addNode(id<NodeId>('a'), 'first');
    g.addNode(id<NodeId>('a'), 'second');
    expect(g.hasNode(id<NodeId>('a'))).toBe(true);
    expect(g.nodes.get(id<NodeId>('a'))).toBe('second');
    expect(g.nodeCount()).toBe(1);
  });

  it('addEdge 起点 / 终点缺失时抛错', () => {
    const g = new MapGraph<unknown, number>(id<GraphId>('m'));
    g.addNode(id<NodeId>('a'));
    expect(() => g.addEdge(id<NodeId>('a'), id<NodeId>('missing'))).toThrow(/target "missing" not found/);
    expect(() => g.addEdge(id<NodeId>('missing'), id<NodeId>('a'))).toThrow(/source "missing" not found/);
  });

  it('addEdge 自动 ID + 显式 ID 混用', () => {
    const g = new MapGraph<unknown, unknown>(id<GraphId>('m'));
    g.addNode(id<NodeId>('a'));
    g.addNode(id<NodeId>('b'));
    const auto1 = g.addEdge(id<NodeId>('a'), id<NodeId>('b'));
    const auto2 = g.addEdge(id<NodeId>('a'), id<NodeId>('b'));
    expect(auto1).toBe('e0');
    expect(auto2).toBe('e1');
    expect(() => g.addEdge(id<NodeId>('a'), id<NodeId>('b'), undefined, id<EdgeId>('e0')))
      .toThrow(/already exists/);
  });

  it('removeEdge 不存在时返回 false', () => {
    const g = new MapGraph<unknown, unknown>(id<GraphId>('m'));
    expect(g.removeEdge(id<EdgeId>('nope'))).toBe(false);
  });

  it('removeNode 同步清理两端关联边', () => {
    const g = MapGraph.from(id<GraphId>('m'), [
      [id<NodeId>('a'), id<NodeId>('b')],
      [id<NodeId>('b'), id<NodeId>('c')],
    ]);
    expect(g.removeNode(id<NodeId>('b'))).toBe(true);
    expect(g.edgeCount()).toBe(0);
    expect(g.removeNode(id<NodeId>('b'))).toBe(false);
  });

  it('removeNode 自环不死锁', () => {
    const g = new MapGraph<unknown, unknown>(id<GraphId>('m'));
    g.addNode(id<NodeId>('s'));
    g.addEdge(id<NodeId>('s'), id<NodeId>('s'));
    expect(g.removeNode(id<NodeId>('s'))).toBe(true);
    expect(g.edgeCount()).toBe(0);
  });

  it('adjacent 检查 source→target 直连', () => {
    const g = MapGraph.from(id<GraphId>('m'), [
      [id<NodeId>('a'), id<NodeId>('b')],
    ]);
    expect(g.adjacent(id<NodeId>('a'), id<NodeId>('b'))).toBe(true);
    expect(g.adjacent(id<NodeId>('b'), id<NodeId>('a'))).toBe(false);
    expect(g.adjacent(id<NodeId>('missing'), id<NodeId>('b'))).toBe(false);
  });

  it('clear 重置全部状态', () => {
    const g = MapGraph.from(id<GraphId>('m'), [
      [id<NodeId>('a'), id<NodeId>('b')],
    ]);
    g.clear();
    expect(g.nodeCount()).toBe(0);
    expect(g.edgeCount()).toBe(0);
    g.addNode(id<NodeId>('x'));
    g.addNode(id<NodeId>('y'));
    expect(g.addEdge(id<NodeId>('x'), id<NodeId>('y'))).toBe('e0'); // 计数器重置
  });
});

describe('MapGraph trait 一致性', () => {
  it('IntoEdgeRefs 三种形式正确产出', () => {
    const g = MapGraph.from(id<GraphId>('m'), [
      [id<NodeId>('a'), id<NodeId>('b'), 1],
      [id<NodeId>('b'), id<NodeId>('c'), 2],
    ]);
    const all = [...g.edgeRefs()].map(r => `${r.source}→${r.target}=${r.weight as number}`);
    expect(all.sort()).toEqual(['a→b=1', 'b→c=2']);
    expect([...g.outgoingEdgeRefs(id<NodeId>('a'))].length).toBe(1);
    expect([...g.incomingEdgeRefs(id<NodeId>('c'))].length).toBe(1);
  });

  it('IntoDegree O(1) 返回入/出度', () => {
    const g = MapGraph.from(id<GraphId>('m'), [
      [id<NodeId>('a'), id<NodeId>('b')],
      [id<NodeId>('a'), id<NodeId>('c')],
      [id<NodeId>('b'), id<NodeId>('c')],
    ]);
    expect(g.inDegree(id<NodeId>('c'))).toBe(2);
    expect(g.outDegree(id<NodeId>('a'))).toBe(2);
    expect(g.inDegree(id<NodeId>('missing'))).toBe(0);
  });

  it('NodeIndexable bound / at / indexOf', () => {
    const g = MapGraph.from(id<GraphId>('m'), [
      [id<NodeId>('a'), id<NodeId>('b')],
    ]);
    expect(g.bound()).toBe(2);
    expect(g.at(0)).toBe('a');
    expect(g.at(99)).toBeUndefined();
    expect(g.indexOf(id<NodeId>('b'))).toBe(1);
    expect(g.indexOf(id<NodeId>('missing'))).toBe(-1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// MatrixGraph
// ──────────────────────────────────────────────────────────────────────

describe('MatrixGraph 基础 CRUD', () => {
  it('O(1) adjacent 查询', () => {
    const g = MatrixGraph.from(id<GraphId>('mx'),
      [id<NodeId>('a'), id<NodeId>('b'), id<NodeId>('c')],
      [[id<NodeId>('a'), id<NodeId>('b')], [id<NodeId>('b'), id<NodeId>('c')]],
    );
    expect(g.adjacent(id<NodeId>('a'), id<NodeId>('b'))).toBe(true);
    expect(g.adjacent(id<NodeId>('a'), id<NodeId>('c'))).toBe(false);
    expect(g.adjacent(id<NodeId>('missing'), id<NodeId>('a'))).toBe(false);
  });

  it('addNode 重复 ID 抛错', () => {
    const g = new MatrixGraph<unknown, unknown>(id<GraphId>('mx'));
    g.addNode(id<NodeId>('a'));
    expect(() => g.addNode(id<NodeId>('a'))).toThrow(/already exists/);
  });

  it('同 source/target 拒绝重复边', () => {
    const g = new MatrixGraph<unknown, unknown>(id<GraphId>('mx'));
    g.addNode(id<NodeId>('a'));
    g.addNode(id<NodeId>('b'));
    g.addEdge(id<NodeId>('a'), id<NodeId>('b'));
    expect(() => g.addEdge(id<NodeId>('a'), id<NodeId>('b')))
      .toThrow(/edge already exists from "a" to "b"/);
  });

  it('automatic _grow 触发：超容量时矩阵 2× 扩容', () => {
    const g = new MatrixGraph<unknown, unknown>(id<GraphId>('mx'), 2); // 容量 2
    g.addNode(id<NodeId>('a'));
    g.addNode(id<NodeId>('b'));
    g.addNode(id<NodeId>('c')); // 触发扩容
    g.addEdge(id<NodeId>('a'), id<NodeId>('c'));
    expect(g.adjacent(id<NodeId>('a'), id<NodeId>('c'))).toBe(true);
    expect(g.nodeCount()).toBe(3);
  });

  it('removeNode 清扫该节点的行 + 列', () => {
    const g = MatrixGraph.from(id<GraphId>('mx'),
      [id<NodeId>('a'), id<NodeId>('b'), id<NodeId>('c')],
      [[id<NodeId>('a'), id<NodeId>('b')], [id<NodeId>('b'), id<NodeId>('c')], [id<NodeId>('c'), id<NodeId>('a')]],
    );
    expect(g.removeNode(id<NodeId>('b'))).toBe(true);
    expect(g.edgeCount()).toBe(1); // 仅 c→a 保留
    expect(g.adjacent(id<NodeId>('c'), id<NodeId>('a'))).toBe(true);
    expect(g.adjacent(id<NodeId>('a'), id<NodeId>('b'))).toBe(false);
  });

  it('IntoEdgeRefs 跳过墓碑位（不产出已删节点的边）', () => {
    const g = MatrixGraph.from(id<GraphId>('mx'),
      [id<NodeId>('a'), id<NodeId>('b')],
      [[id<NodeId>('a'), id<NodeId>('b')]],
    );
    g.removeNode(id<NodeId>('a'));
    expect([...g.edgeRefs()].length).toBe(0);
    expect([...g.outgoingEdgeRefs(id<NodeId>('b'))].length).toBe(0);
  });
});

describe('MatrixGraph trait 一致性', () => {
  it('Neighbors 三种形式', () => {
    const g = MatrixGraph.from(id<GraphId>('mx'),
      [id<NodeId>('a'), id<NodeId>('b'), id<NodeId>('c')],
      [[id<NodeId>('a'), id<NodeId>('b')], [id<NodeId>('a'), id<NodeId>('c')]],
    );
    expect([...g.outgoingNeighbors(id<NodeId>('a'))].sort()).toEqual(['b', 'c']);
    expect([...g.incomingNeighbors(id<NodeId>('c'))]).toEqual(['a']);
    expect([...g.neighbors(id<NodeId>('a'))].sort()).toEqual(['b', 'c']);
  });

  it('IntoDegree 在矩阵上 O(N) 计数', () => {
    const g = MatrixGraph.from(id<GraphId>('mx'),
      [id<NodeId>('a'), id<NodeId>('b'), id<NodeId>('c')],
      [[id<NodeId>('a'), id<NodeId>('b')], [id<NodeId>('a'), id<NodeId>('c')]],
    );
    expect(g.inDegree(id<NodeId>('c'))).toBe(1);
    expect(g.outDegree(id<NodeId>('a'))).toBe(2);
  });

  it('NodeIndexable bound > nodeCount when tombstones exist', () => {
    const g = MatrixGraph.from(id<GraphId>('mx'),
      [id<NodeId>('a'), id<NodeId>('b'), id<NodeId>('c')],
      [],
    );
    g.removeNode(id<NodeId>('b'));
    expect(g.bound()).toBe(3);
    expect(g.nodeCount()).toBe(2);
    expect(g.at(1)).toBeUndefined(); // 墓碑
    expect(g.indexOf(id<NodeId>('a'))).toBe(0);
    expect(g.indexOf(id<NodeId>('missing'))).toBe(-1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 2.1 / 2.2 free-list 性能/资源回归
// ──────────────────────────────────────────────────────────────────────

describe('MatrixGraph 2.1 fix: _edgeIdPool free-list 防止单调膨胀', () => {
  it('增删循环后 pool 长度有界 + _freeEdgeSlots 非空', () => {
    const g = MatrixGraph.from(id<GraphId>('p'),
      [id<NodeId>('a'), id<NodeId>('b'), id<NodeId>('c')],
      [],
    );
    const pool: EdgeId[] = (g as unknown as { _edgeIdPool: EdgeId[] })._edgeIdPool;
    const freeSlots: number[] = (g as unknown as { _freeEdgeSlots: number[] })._freeEdgeSlots;
    const initialLen = pool.length;
    for (let i = 0; i < 50; i++) {
      const e1 = g.addEdge(id<NodeId>('a'), id<NodeId>('c'));
      g.removeEdge(e1);
      const e2 = g.addEdge(id<NodeId>('c'), id<NodeId>('a'));
      g.removeEdge(e2);
    }
    expect(pool.length).toBeLessThanOrEqual(initialLen + 2);
    expect(freeSlots.length).toBeGreaterThan(0);
  });
});

describe('MatrixGraph 2.2 fix: addNode 使用 _freeNodeSlots 替代 indexOf(null)', () => {
  it('removeNode 后 _freeNodeSlots 增长；再 addNode 优先复用', () => {
    const g = new MatrixGraph<unknown, unknown>(id<GraphId>('n'));
    for (let i = 0; i < 10; i++) g.addNode(id<NodeId>(`n${i}`));
    const initialBound = g.bound();
    const freeSlots: number[] = (g as unknown as { _freeNodeSlots: number[] })._freeNodeSlots;

    for (let i = 0; i < 10; i += 2) g.removeNode(id<NodeId>(`n${i}`));
    expect(freeSlots.length).toBe(5);

    for (let i = 0; i < 5; i++) g.addNode(id<NodeId>(`r${i}`));
    expect(g.bound()).toBe(initialBound); // 复用墓碑后 bound 不增
    expect(freeSlots.length).toBe(0);
    expect(g.nodeCount()).toBe(10);
  });

  it('reuse 后矩阵中该索引行/列已被 removeNode 清零', () => {
    const g = MatrixGraph.from(id<GraphId>('n'),
      [id<NodeId>('a'), id<NodeId>('b'), id<NodeId>('c')],
      [[id<NodeId>('a'), id<NodeId>('b')], [id<NodeId>('b'), id<NodeId>('c')]],
    );
    const oldIndex = g.indexOf(id<NodeId>('b'));
    g.removeNode(id<NodeId>('b'));
    g.addNode(id<NodeId>('newB'));
    // newB 应当复用 b 的索引位置
    expect(g.indexOf(id<NodeId>('newB'))).toBe(oldIndex);
    // 复用后 a→newB / newB→c 不存在（被 removeNode 清零）
    expect(g.adjacent(id<NodeId>('a'), id<NodeId>('newB'))).toBe(false);
    expect(g.adjacent(id<NodeId>('newB'), id<NodeId>('c'))).toBe(false);
  });
});
