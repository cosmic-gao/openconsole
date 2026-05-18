/**
 * Edge：图中的有向边，从 source 端点指向 target 端点。
 */

import type { Direction, EdgeId, NodeId } from '../types';
import type { Endpoint } from './endpoint';

/**
 * 图中的有向边，从 `source` 端点指向 `target` 端点。
 *
 * @template W 边附带的数据载荷类型
 */
export class Edge<W = unknown> {
  /** 附带在边上的数据载荷。 */
  public weight: W | undefined;

  /**
   * @param id 边唯一标识
   * @param source 起点 (输出端点)
   * @param target 终点 (输入端点)
   * @param weight 边附带的数据载荷
   */
  public constructor(
    public readonly id: EdgeId,
    public readonly source: Endpoint,
    public readonly target: Endpoint,
    weight?: W,
  ) {
    this.weight = weight;
  }

  /** 起点节点 ID。 */
  public get sourceId(): NodeId {
    return this.source.nodeId;
  }

  /** 终点节点 ID。 */
  public get targetId(): NodeId {
    return this.target.nodeId;
  }

  /**
   * 本条边是否与给定节点相关（作为起点或终点）。
   *
   * @param nodeId 节点 ID
   */
  public connects(nodeId: NodeId): boolean {
    return this.source.nodeId === nodeId || this.target.nodeId === nodeId;
  }

  /**
   * 给定方向，返回另一端的节点 ID。
   *
   * @param direction `'input'` 视角（从终点看）返回起点；`'output'` 视角（从起点看）返回终点
   * @returns 对侧节点的 ID
   */
  public opposite(direction: Direction): NodeId {
    return direction === 'input' ? this.source.nodeId : this.target.nodeId;
  }
}
