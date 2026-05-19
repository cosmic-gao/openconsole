/**
 * 测试覆盖：Endpoint 访问器与 Edge 的端点 / 权重 / 方向逻辑。
 */
import { describe, expect, it } from 'vitest';

import { Edge, Endpoint, type EdgeId, type NodeId } from '../../core';
import { id, portNode } from '../_fixtures';

describe('Endpoint / Edge', () => {
  it('Endpoint 提供 nodeId / portId 访问器', () => {
    const A = portNode('A');
    const ep = new Endpoint(A, A.output('y')!);
    expect(ep.nodeId).toBe('A');
    expect(ep.portId).toBe('A:output:y');
  });

  it('Edge.connects / sourceId / targetId / opposite', () => {
    const A = portNode('A');
    const B = portNode('B');
    const edge = new Edge(
      id<EdgeId>('e1'),
      new Endpoint(A, A.output('y')!),
      new Endpoint(B, B.input('x')!),
      'w',
    );
    expect(edge.sourceId).toBe('A');
    expect(edge.targetId).toBe('B');
    expect(edge.connects(id<NodeId>('A'))).toBe(true);
    expect(edge.connects(id<NodeId>('C'))).toBe(false);
    expect(edge.opposite('input')).toBe('A');
    expect(edge.opposite('output')).toBe('B');
    expect(edge.weight).toBe('w');
  });
});
