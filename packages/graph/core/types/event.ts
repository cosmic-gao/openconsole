import type { Signal } from "@openconsole/signal";

import type { Edge } from "../classic";
import type { NodeId } from "./brand";
import type { Node } from "./port";

/** 访问者控制流：继续遍历 / 剪枝子树 / 中断遍历。 */
export type Control = "continue" | "prune" | "break";

/**
 * 深度优先搜索（DFS）事件：描述遍历过程中的节点发现、完成及边分类。
 * @typeParam T - 时间戳类型。
 */
export interface DfsEvent<T = number> {
  /** 事件种类：发现节点、完成节点、树边、回边、横叉边。 */
  readonly kind: "discover" | "finish" | "treeEdge" | "backEdge" | "crossEdge";
  /** 当前节点 ID。 */
  readonly node: NodeId;
  /** 边类事件的目标节点 ID。 */
  readonly target?: NodeId;
  /** 事件发生的时间戳。 */
  readonly time?: T;
}

/**
 * 图变更事件映射：键为事件名，值为对应的事件负载。
 * @typeParam N - 节点权重类型。
 * @typeParam E - 边权重类型。
 */
export interface Events<N = unknown, E = unknown> {
  /** 节点被添加。 */
  nodeAdded: { node: Node<N> };
  /** 节点被移除。 */
  nodeDropped: { node: Node<N> };
  /** 节点权重被更新（含更新前后的值）。 */
  nodeUpdated: { node: Node<N>; before: N | undefined; after: N | undefined };
  /** 边被添加。 */
  edgeAdded: { edge: Edge<E> };
  /** 边被移除。 */
  edgeDropped: { edge: Edge<E> };
  /** 边权重被更新（含更新前后的值）。 */
  edgeUpdated: { edge: Edge<E>; before: E | undefined; after: E | undefined };
}

/**
 * 可订阅能力：暴露图变更事件信号供外部监听。
 * @typeParam N - 节点权重类型。
 * @typeParam E - 边权重类型。
 */
export interface Subscribable<N = unknown, E = unknown> {
  /** 图变更事件信号。 */
  readonly signal: Signal<Events<N, E>>;
}
