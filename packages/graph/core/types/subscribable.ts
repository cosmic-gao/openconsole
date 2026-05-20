/**
 * 图变更事件载体与可订阅 trait。
 */

// 仅类型 import：types ↔ classic 经 barrel 形成的循环只在 `import type` 下被
// TS 擦除消解；切忌把下面的 `import type` 升级为值 import，否则会触发真正的
// 运行时循环依赖。
import type { Edge } from '../classic';
import type { Vertex } from './port';

/**
 * 图变更事件载体类型。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export interface EventMap<N = unknown, E = unknown> {
  /** 新节点入图。 */
  nodeAdded: { node: Vertex<N> };
  /** 节点已离开图（其入/出边已先一步触发 `edgeRemoved`）。 */
  nodeRemoved: { node: Vertex<N> };
  /** 新边入图。 */
  edgeAdded: { edge: Edge<E> };
  /** 边已离开图。 */
  edgeRemoved: { edge: Edge<E> };
}

/** 事件名集合。 */
export type EventName = keyof EventMap;

/** 事件订阅者回调签名。 */
export type Listener<P> = (payload: P) => void;

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
  on<K extends EventName>(
    event: K,
    listener: Listener<EventMap<N, E>[K]>,
  ): () => void;
}
