/**
 * 边视图类型：{@link EdgeView} 及其列举能力 {@link IntoEdges}。
 */

import type { EdgeId, NodeId } from './brand';

/**
 * 边的轻量值视图，与具体存储解耦。
 *
 * @remarks
 * - 算法层只依赖 `EdgeView<E>` 即可遍历边；具体图实现不需要暴露 {@link Edge} 类。
 * - 翻转视图 ({@link Reversed}) 等零成本适配器仅交换 `source` / `target`，无需重新构造重型 {@link Edge}。
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
 * 能列举轻量 {@link EdgeView} 的能力 trait。
 *
 * @remarks
 * {@link Graph} 与 {@link Reversed} 等视图都可以低成本地实现该 trait，
 * 从而被同一份算法消费。
 *
 * 方法命名遵循项目"单词动词 / 名词"约定：
 * - `getEdges()` 返回全部视图；
 * - `getIncoming(id)` / `getOutgoing(id)` 是方向化快捷入口。
 *
 * @template E 边权重类型
 */
export interface IntoEdges<E = unknown> {
  /** 全图所有边视图。 */
  getEdges(): Iterable<EdgeView<E>>;
  /** 流入 `nodeId` 的边视图。 */
  getIncoming(nodeId: NodeId): Iterable<EdgeView<E>>;
  /** 流出 `nodeId` 的边视图。 */
  getOutgoing(nodeId: NodeId): Iterable<EdgeView<E>>;
}
