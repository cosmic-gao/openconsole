/**
 * DfsEvent：DFS 访问事件载体。
 */

import type { NodeId } from './brand';

/**
 * DFS 访问事件。
 *
 * @remarks 便于 dominator/topo/SCC 等算法基于事件流编写。
 *
 * @template T 用户载荷类型，预留给计时器（discover/finish 时间戳）等扩展使用
 */
export interface DfsEvent<T = number> {
  /** 事件种类（直接以字符串字面量联合给出，无需额外的 `Kind` 别名）。 */
  readonly kind: 'discover' | 'finish' | 'treeEdge' | 'backEdge' | 'crossForwardEdge';
  /** 主节点 ID（discover/finish 时即当前节点；treeEdge 等事件时即源节点）。 */
  readonly node: NodeId;
  /** 边事件的目标节点 ID；非边事件时为 `undefined`。 */
  readonly target?: NodeId;
  /** 事件发生时的时间戳（discover/finish 计数）。 */
  readonly time?: T;
}
