/**
 * 测试覆盖：Model.batch() 事务 API（事件挂起、嵌套、异常路径）。
 */
import { describe, expect, it } from 'vitest';

import { Graph, type GraphId, type NodeId } from '../../core';
import { portNode } from '../_fixtures';

const make = () => new Graph<unknown, unknown>('g' as GraphId);

describe('batch', () => {
  it('事务期间事件被挂起，结束才统一派发', () => {
    const g = make();
    const seen: string[] = [];
    g.signal.watch((type) => seen.push(String(type)));

    g.batch(() => {
      g.addNode(portNode('a'));
      g.addNode(portNode('b'));
      // 事务内部还没派发
      expect(seen).toEqual([]);
    });
    expect(seen).toEqual(['nodeAdded', 'nodeAdded']);
  });

  it('事务的回调返回值原样转出', () => {
    const g = make();
    const out = g.batch(() => {
      g.addNode(portNode('a'));
      return 42;
    });
    expect(out).toBe(42);
  });

  it('嵌套事务用计数器：只在最外层退出时 drain', () => {
    const g = make();
    const seen: string[] = [];
    g.signal.watch((type) => seen.push(String(type)));

    g.batch(() => {
      g.addNode(portNode('a'));
      g.batch(() => {
        g.addNode(portNode('b'));
        expect(seen).toEqual([]);   // 内层退出但还在外层事务里
      });
      expect(seen).toEqual([]);
    });
    expect(seen).toEqual(['nodeAdded', 'nodeAdded']);
  });

  it('事务中抛错也会 drain 已累积事件', () => {
    const g = make();
    const seen: string[] = [];
    g.signal.watch((type) => seen.push(String(type)));

    expect(() => g.batch(() => {
      g.addNode(portNode('a'));
      throw new Error('boom');
    })).toThrow('boom');

    expect(seen).toEqual(['nodeAdded']);
  });

  it('connect 在事务中触发的 edgeAdded 也会被延后', () => {
    const g = make();
    const order: string[] = [];
    g.signal.on('nodeAdded', ({ node }) => order.push(`node:${String(node.id)}`));
    g.signal.on('edgeAdded', ({ edge }) => order.push(`edge:${String(edge.id)}`));

    g.batch(() => {
      g.addNode(portNode('a'));
      g.addNode(portNode('b'));
      g.connect(['a' as NodeId, 'y'], ['b' as NodeId, 'x']);
      expect(order).toEqual([]);
    });
    // 入队序保留：先两节点再边
    expect(order).toEqual(['node:a', 'node:b', 'edge:e0']);
  });
});
