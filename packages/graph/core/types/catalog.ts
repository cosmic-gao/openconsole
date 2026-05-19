/**
 * Catalog 能力：节点 / 边可枚举与计数。
 */

import type { EdgeId, NodeId } from './brand';

/** 最小图接口 - 所有图实现必须提供的能力。 */
export interface Catalog {
  /** 节点 ID 的可迭代视图。 */
  readonly nodeIds: Iterable<NodeId>;
  /** 边 ID 的可迭代视图。 */
  readonly edgeIds: Iterable<EdgeId>;
  /** 当前节点总数。 */
  nodeCount(): number;
  /** 当前边总数。 */
  edgeCount(): number;
}
