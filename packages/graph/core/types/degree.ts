/**
 * Degree 与 IntoDegree：节点入度 / 出度的数据形态与能力 trait。
 */

import type { NodeId } from './brand';

/** 入度/出度信息 - 算法消费用。 */
export interface Degree {
  /** 流入节点的边数。 */
  inDegree: number;
  /** 流出节点的边数。 */
  outDegree: number;
}

/** 能直接给出度数 - 拓扑排序、入口分析等算法消费。 */
export interface IntoDegree {
  /** 流入边数。 */
  inDegree(nodeId: NodeId): number;
  /** 流出边数。 */
  outDegree(nodeId: NodeId): number;
}
