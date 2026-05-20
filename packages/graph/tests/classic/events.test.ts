/**
 * 测试覆盖：Graph 事件系统（`signal.on / off / emit`）。
 */
import { describe, expect, it, vi } from 'vitest';

import { Graph, type Edge, type EdgeId, type GraphId, type NodeId, type Node } from '../../core';
import { id, portNode } from '../_fixtures';

const newGraph = () => new Graph<unknown, string>(id<GraphId>('g'));

describe('Graph events', () => {
  it('nodeAdded 在 addNode 后触发，回调收到节点引用', () => {
    const g = newGraph();
    const seen: string[] = [];
    g.signal.on('nodeAdded', ({ node }: { node: Node<unknown> }) => seen.push(String(node.id)));
    g.addNode(portNode('A'));
    g.addNode(portNode('B'));
    expect(seen).toEqual(['A', 'B']);
  });

  it('edgeAdded 在 addEdge 后触发', () => {
    const g = newGraph();
    const A = portNode('A');
    const B = portNode('B');
    g.addNode(A).addNode(B);

    const seen: EdgeId[] = [];
    g.signal.on('edgeAdded', ({ edge }: { edge: Edge<string> }) => seen.push(edge.id));
    g.connect([id<NodeId>('A'), 'y'], [id<NodeId>('B'), 'x'], { id: id<EdgeId>('e1') });
    expect(seen).toEqual(['e1']);
  });

  it('removeNode 先发 edgeRemoved 再发 nodeRemoved', () => {
    const g = newGraph();
    const A = portNode('A');
    const B = portNode('B');
    g.addNode(A).addNode(B);
    g.connect([id<NodeId>('A'), 'y'], [id<NodeId>('B'), 'x'], { id: id<EdgeId>('e1') });

    const events: string[] = [];
    g.signal.on('edgeRemoved', ({ edge }: { edge: Edge<string> }) => events.push(`e-:${edge.id}`));
    g.signal.on('nodeRemoved', ({ node }: { node: Node<unknown> }) => events.push(`n-:${node.id}`));
    g.removeNode(id<NodeId>('A'));
    expect(events).toEqual(['e-:e1', 'n-:A']);
  });

  it('off 取消订阅', () => {
    const g = newGraph();
    const cb = vi.fn();
    g.signal.on('nodeAdded', cb);
    g.addNode(portNode('A'));
    expect(cb).toHaveBeenCalledTimes(1);
    g.signal.off('nodeAdded', cb);
    g.addNode(portNode('B'));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('on 返回的取消函数等价于 off', () => {
    const g = newGraph();
    const cb = vi.fn();
    const off = g.signal.on('nodeAdded', cb);
    g.addNode(portNode('A'));
    off();
    g.addNode(portNode('B'));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('多订阅者并存', () => {
    const g = newGraph();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    g.signal.on('nodeAdded', cb1);
    g.signal.on('nodeAdded', cb2);
    g.addNode(portNode('A'));
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('clear 不触发事件（批量清空场景）', () => {
    const g = newGraph();
    g.addNode(portNode('A'));
    const cb = vi.fn();
    g.signal.on('nodeRemoved', cb);
    g.signal.on('edgeRemoved', cb);
    g.clear();
    expect(cb).not.toHaveBeenCalled();
  });

  it('O(1) at/indexOf：值正确', () => {
    const g = newGraph();
    g.addNode(portNode('A')).addNode(portNode('B')).addNode(portNode('C'));
    expect(g.at(0)).toBe('A');
    expect(g.at(2)).toBe('C');
    expect(g.indexOf(id<NodeId>('B'))).toBe(1);
  });

  it('removeNode swap-and-pop 后 indexOf 仍能找到剩余节点', () => {
    const g = newGraph();
    g.addNode(portNode('A')).addNode(portNode('B')).addNode(portNode('C'));
    g.removeNode(id<NodeId>('A'));   // C 会被 swap 到 index 0
    expect(g.indexOf(id<NodeId>('A'))).toBe(-1);
    expect(g.indexOf(id<NodeId>('B'))).toBeGreaterThanOrEqual(0);
    expect(g.indexOf(id<NodeId>('C'))).toBeGreaterThanOrEqual(0);
    expect(g.bound()).toBe(2);
  });
});
