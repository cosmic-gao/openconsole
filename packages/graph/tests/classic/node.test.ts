/**
 * 测试覆盖：Node 端口注册 / 移除 / 查询与 weight 读写。
 */
import { describe, expect, it } from 'vitest';

import { Node, Socket, type NodeId, type Sockets } from '../../core';
import { id, portNode } from '../_fixtures';

describe('Node', () => {
  it('addInput / addOutput 注册端口并自动生成 ID', () => {
    const n = new Node(id<NodeId>('A'));
    const inp = n.addInput('x', Socket.number);
    const out = n.addOutput('y', Socket.number);
    expect(inp.id).toBe('A:input:x');
    expect(out.id).toBe('A:output:y');
    expect(n.hasInput('x')).toBe(true);
    expect(n.hasOutput('y')).toBe(true);
    expect(n.input('x')).toBe(inp);
    expect(n.output('y')).toBe(out);
  });

  it('removeInput / removeOutput 正确删除端口', () => {
    const n = portNode('A');
    expect(n.removeInput('x')).toBe(true);
    expect(n.hasInput('x')).toBe(false);
    expect(n.removeInput('x')).toBe(false);
    expect(n.removeOutput('y')).toBe(true);
    expect(n.removeOutput('y')).toBe(false);
  });

  it('weight 可读写', () => {
    const n = new Node<Sockets, Sockets, { label: string }>(id<NodeId>('A'), { label: 'init' });
    expect(n.weight).toEqual({ label: 'init' });
    n.weight = { label: 'changed' };
    expect(n.weight?.label).toBe('changed');
  });
});
