/**
 * GraphEventMap / Subscribable：图变更事件载体与可订阅 trait。
 */

import type { Edge } from '../classic/edge';
import type { Vertex } from './port';

/**
 * 图变更事件载体类型。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export interface GraphEventMap<N = unknown, E = unknown> {
  /** 新节点入图。 */
  nodeAdded: { node: Vertex<N> };
  /** 节点已离开图（其入/出边已先一步触发 edgeRemoved）。 */
  nodeRemoved: { node: Vertex<N> };
  /** 新边入图。 */
  edgeAdded: { edge: Edge<E> };
  /** 边已离开图。 */
  edgeRemoved: { edge: Edge<E> };
}

/** Graph 事件名集合。 */
export type GraphEventName = keyof GraphEventMap;

/** Graph 事件订阅者回调签名。 */
export type GraphListener<P> = (payload: P) => void;

/**
 * 可订阅图变更事件的能力 trait。
 *
 * @remarks
 * `IncrementalTopo` 等增量算法依赖此 trait 订阅原图的变更。
 * 由 {@link Graph} 实现；适配器视图不实现（视图本身无独立 mutate 入口）。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export interface Subscribable<N = unknown, E = unknown> {
  /**
   * 订阅图变更事件。
   *
   * @template K 事件名
   * @param event 事件名
   * @param listener 回调
   * @returns 取消订阅函数
   */
  on<K extends GraphEventName>(
    event: K,
    listener: GraphListener<GraphEventMap<N, E>[K]>,
  ): () => void;
}
