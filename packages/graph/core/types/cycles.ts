/**
 * 拓扑排序结果类型：Cycles + Topology。
 */

import type { NodeId } from './brand';

/** 拓扑排序时返回的环路信息。 */
export interface Cycles {
  /** 是否检测到环。 */
  hasCycle: boolean;
  /** 环上的节点 ID 列表；无环时为空数组。 */
  cycleNodes: NodeId[];
}

/** 拓扑排序结果。 */
export interface Topology {
  /** 拓扑顺序的节点 ID 序列；含环时环上节点按原始顺序追加在末尾。 */
  order: NodeId[];
  /** 排序过程中收集的环路信息。 */
  cycles: Cycles;
}
