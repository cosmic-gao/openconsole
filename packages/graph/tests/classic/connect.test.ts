/**
 * 测试覆盖：Graph.connect 流式 API。
 */
import { describe, expect, it } from 'vitest';

import { Graph, type EdgeId, type GraphId, type NodeId } from '../../core';
import { id, portNode } from '../_fixtures';

const newGraph = () => new Graph<unknown, string>(id<GraphId>('g'));

describe('Graph.connect', () => {
  it('按 [节点ID, 端口名] 元组连边，返回新 Edge', () => {
    const g = newGraph();
    const A = portNode('A');
    const B = portNode('B');
    g.addNode(A).addNode(B);
    const edge = g.connect([id<NodeId>('A'), 'y'], [id<NodeId>('B'), 'x'], { weight: 'w' });
    expect(edge.weight).toBe('w');
    expect(edge.sourceId).toBe('A');
    expect(edge.targetId).toBe('B');
    expect(g.edgeCount()).toBe(1);
  });

  it('自动分配边 ID 不与现有冲突', () => {
    const g = newGraph();
    g.addNode(portNode('A')).addNode(portNode('B'));
    const e1 = g.connect([id<NodeId>('A'), 'y'], [id<NodeId>('B'), 'x']);
    const e2 = g.connect([id<NodeId>('A'), 'y'], [id<NodeId>('B'), 'x']);
    expect(e1.id).not.toBe(e2.id);
  });

  it('显式 id 选项被采用', () => {
    const g = newGraph();
    g.addNode(portNode('A')).addNode(portNode('B'));
    const edge = g.connect(
      [id<NodeId>('A'), 'y'],
      [id<NodeId>('B'), 'x'],
      { id: id<EdgeId>('my-edge') },
    );
    expect(edge.id).toBe('my-edge');
  });

  it('未知节点抛错', () => {
    const g = newGraph();
    g.addNode(portNode('A'));
    expect(() =>
      g.connect([id<NodeId>('A'), 'y'], [id<NodeId>('missing'), 'x']),
    ).toThrow(/target node "missing" not found/);
  });

  it('未知端口名抛错', () => {
    const g = newGraph();
    g.addNode(portNode('A')).addNode(portNode('B'));
    expect(() =>
      g.connect([id<NodeId>('A'), 'nonexistent'], [id<NodeId>('B'), 'x']),
    ).toThrow(/output port "nonexistent" not found/);
  });
});
