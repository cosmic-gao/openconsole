/**
 * EdgeView 与 IntoEdgeViews：边的轻量值视图及其列举能力。
 */

import type { EdgeId, NodeId } from './brand';

/**
 * 边的轻量值视图，与具体存储解耦。
 *
 * @remarks
 * - 算法层只依赖 `EdgeView<E>` 即可遍历边；具体图实现不需要暴露 {@link Edge} 类。
 * - 翻转视图（{@link Reversed}）等零成本适配器仅交换 `source` / `target`，无需重新构造重型 {@link Edge}。
 *
 * @template E 边权重类型
 */
export interface EdgeView<E = unknown> {
  /** 边唯一标识。 */
  readonly id: EdgeId;
  /** 起点节点 ID。 */
  readonly source: NodeId;
  /** 终点节点 ID。 */
  readonly target: NodeId;
  /** 边权重；缺省时为 `undefined`。 */
  readonly weight: E | undefined;
}

/**
 * 能列举边的轻量视图 ({@link EdgeView})。
 *
 * @remarks
 * {@link Graph} 与 {@link Reversed} 等视图都可以低成本地实现该 trait，
 * 从而被同一份算法消费。
 *
 * @template E 边权重类型
 */
export interface IntoEdgeViews<E = unknown> {
  /** 全图所有边视图。 */
  getEdges(): Iterable<EdgeView<E>>;
  /** 流入节点的边视图。 */
  getIncomingEdges(nodeId: NodeId): Iterable<EdgeView<E>>;
  /** 流出节点的边视图。 */
  getOutgoingEdges(nodeId: NodeId): Iterable<EdgeView<E>>;
}
