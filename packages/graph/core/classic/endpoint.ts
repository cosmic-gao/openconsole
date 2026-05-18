/**
 * Endpoint：节点 + 端口的组合，描述边的一端。
 */

import type { NodeId, PortId } from '../types';
import type { Node } from './node';
import type { Port } from './port';

/**
 * 端点 (endpoint) = 节点 + 节点上的某个端口，用于描述边的两端。
 *
 * @template N 节点类型
 * @template P 端口类型
 */
export class Endpoint<N extends Node = Node, P extends Port = Port> {
  /**
   * @param node 端点所在的节点
   * @param port 端点对应的端口
   */
  public constructor(
    public readonly node: N,
    public readonly port: P,
  ) {}

  /** 端点所在节点的 ID（{@link node}.id 的便捷访问器）。 */
  public get nodeId(): NodeId {
    return this.node.id;
  }

  /** 端点对应端口的 ID（{@link port}.id 的便捷访问器）。 */
  public get portId(): PortId {
    return this.port.id;
  }
}
