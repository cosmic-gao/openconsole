/**
 * 测试覆盖：Port 抽象基类与 Input / Output 的方向 + edges 维护。
 */
import { describe, expect, it } from 'vitest';

import { Input, Output, Socket, type EdgeId, type PortId } from '../../core';
import { id } from '../_fixtures';

describe('Port (Input / Output)', () => {
  it('Input 与 Output 暴露正确的 direction', () => {
    const inp = new Input(Socket.number, id<PortId>('p:i'));
    const out = new Output(Socket.number, id<PortId>('p:o'));
    expect(inp.direction).toBe('input');
    expect(out.direction).toBe('output');
  });

  it('attach / detach 维护边列表', () => {
    const port = new Output(Socket.number, id<PortId>('p:o'));
    expect(port.connected).toBe(false);
    port.attach(id<EdgeId>('e1'));
    port.attach(id<EdgeId>('e2'));
    expect(port.edges).toEqual(['e1', 'e2']);
    expect(port.connected).toBe(true);
    expect(port.detach(id<EdgeId>('e1'))).toBe(true);
    expect(port.edges).toEqual(['e2']);
    expect(port.detach(id<EdgeId>('missing'))).toBe(false);
  });

  it('attach 不再做 includes 去重 (Graph.addEdge 已在上游保证)', () => {
    const port = new Output(Socket.number, id<PortId>('p:o'));
    port.attach(id<EdgeId>('e1'));
    port.attach(id<EdgeId>('e1'));
    expect(port.edges).toHaveLength(2);
  });
});
