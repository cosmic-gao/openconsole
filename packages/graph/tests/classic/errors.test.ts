/**
 * 测试覆盖：类型化错误层（errors.ts）。
 */
import { describe, expect, it } from 'vitest';

import {
  Cycle,
  Duplicate,
  GraphError,
  Misdirected,
  Missing,
  Negative,
  Schema,
  Socket,
  SocketMismatch,
  Vertex,
  type EdgeId,
  type NodeId,
  type PortId,
} from '../../core';
import { buildGraph, id, portNode } from '../_fixtures';

describe('errors', () => {
  it('GraphError 是所有错误的基类', () => {
    expect(new Duplicate('node', id<NodeId>('a'))).toBeInstanceOf(GraphError);
    expect(new Missing('node', id<NodeId>('x'))).toBeInstanceOf(GraphError);
    expect(new Cycle([id<NodeId>('a'), id<NodeId>('b')])).toBeInstanceOf(GraphError);
    expect(new SocketMismatch('number', 'string', id<EdgeId>('e0'))).toBeInstanceOf(GraphError);
    expect(new Misdirected('source', 'output', 'input', id<PortId>('p'))).toBeInstanceOf(GraphError);
    expect(new Negative(-1, id<EdgeId>('e0'))).toBeInstanceOf(GraphError);
    expect(new Schema(2, 1)).toBeInstanceOf(GraphError);
  });

  it('Duplicate code = "duplicate"', () => {
    expect(new Duplicate('node', id<NodeId>('a')).code).toBe('duplicate');
  });

  it('Missing 带 hint 时显示在消息里', () => {
    const e = new Missing('port', id<PortId>('p'), 'connect target');
    expect(e.message).toMatch(/p/);
    expect(e.message).toMatch(/connect target/);
  });

  it('Cycle 持有 nodes 数组', () => {
    const e = new Cycle([id<NodeId>('a'), id<NodeId>('b'), id<NodeId>('a')]);
    expect(e.nodes).toEqual(['a', 'b', 'a']);
    expect(e.message).toContain('a -> b -> a');
  });

  it('addNode 同 ID 抛 Duplicate', () => {
    const g = buildGraph('dup', []);
    g.addNode(portNode('a'));
    expect(() => g.addNode(portNode('a'))).toThrowError(Duplicate);
  });

  it('addEdge 端口 socket 不兼容抛 SocketMismatch', () => {
    const g = buildGraph('mm', []);
    const a = new Vertex(id<NodeId>('a'));
    a.addOutput('y', Socket.string);
    g.addNode(a);
    const b = new Vertex(id<NodeId>('b'));
    b.addInput('x', Socket.number);
    g.addNode(b);
    expect(() => g.connect([id<NodeId>('a'), 'y'], [id<NodeId>('b'), 'x'])).toThrowError(SocketMismatch);
  });

  it('connect 端口缺失抛 Missing', () => {
    const g = buildGraph('mp', []);
    g.addNode(portNode('a'));
    g.addNode(portNode('b'));
    expect(() => g.connect([id<NodeId>('a'), 'nope'], [id<NodeId>('b'), 'x'])).toThrowError(Missing);
  });
});
