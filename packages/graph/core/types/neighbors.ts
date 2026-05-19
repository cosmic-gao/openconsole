/**
 * Neighbors 能力：列举直接邻居。
 */

import type { NodeId } from './brand';
import type { Direction } from './direction';

/**
 * 能列举直接邻居（出/入邻居）。
 *
 * @remarks
 * 用 `direction` 可选参数区分方向：
 * - 缺省：返回 前驱 + 后继（可能含重复，与原 `neighbors(node)` 行为一致）；
 * - `'input'`：仅前驱；
 * - `'output'`：仅后继。
 *
 * 调用方在编译期已知方向时，应直接使用 {@link incomingNeighbors} / {@link outgoingNeighbors}
 * （明确语义、避免 `direction` 参数转发）。`neighbors(node, dir)` 仅在算法 / 适配器
 * 需要按运行时方向分派时使用。
 */
export interface Neighbors {
  /** 邻居迭代；缺省返回前驱 + 后继。 */
  neighbors(nodeId: NodeId, direction?: Direction): Iterable<NodeId>;
  /** 仅前驱（流入侧邻居），等价于 `neighbors(nodeId, 'input')`。 */
  incomingNeighbors(nodeId: NodeId): Iterable<NodeId>;
  /** 仅后继（流出侧邻居），等价于 `neighbors(nodeId, 'output')`。 */
  outgoingNeighbors(nodeId: NodeId): Iterable<NodeId>;
}
