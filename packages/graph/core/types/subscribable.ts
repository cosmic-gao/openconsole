/**
 * 图变更事件载体与可订阅 trait。
 */

import type { Signal } from '@openconsole/signal';

// 仅类型 import：types ↔ classic 经 barrel 形成的循环只在 `import type` 下被
// TS 擦除消解；切忌把下面的 `import type` 升级为值 import，否则会触发真正的
// 运行时循环依赖。
import type { Edge } from '../classic';
import type { Node } from './port';

/**
 * 图变更事件载体类型。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export interface Events<N = unknown, E = unknown> {
  /** 新节点入图。 */
  nodeAdded: { node: Node<N> };
  /** 节点已离开图（其入/出边已先一步触发 `edgeRemoved`）。 */
  nodeRemoved: { node: Node<N> };
  /** 新边入图。 */
  edgeAdded: { edge: Edge<E> };
  /** 边已离开图。 */
  edgeRemoved: { edge: Edge<E> };
}

/**
 * 可订阅图变更事件的能力 trait —— 直接暴露内置 {@link Signal}，
 * 调用方按需使用 `signal.on / once / watch / off` 等全套 API。
 *
 * @remarks
 * `IncrementalTopo` 等增量算法依赖此 trait 订阅原图的变更。
 * 由 {@link Graph} 实现；适配器视图不实现（视图本身无独立 mutate 入口）。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export interface Subscribable<N = unknown, E = unknown> {
  readonly signal: Signal<Events<N, E>>;
}
