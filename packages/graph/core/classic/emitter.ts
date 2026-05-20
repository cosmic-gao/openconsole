/**
 * Emitter：在 {@link Model} 之上叠加事件订阅能力。
 */

import { Signal } from '@opendesign/signal';

import type { Events, Listener, Subscribable } from '../types';
import { Model } from './model';

/**
 * 事件层：覆写 {@link Model._emit} 模板钩子，把 CRUD 路径上的事件接入
 * `@opendesign/signal`，并暴露 {@link on} / {@link off} 订阅 API。
 *
 * @remarks 与 Model 的关系：Model 决定"何时派发"（事件触发点固定在 CRUD 内部），
 *   Emitter 决定"如何派发"（接到 Signal）。继承叠加而非组合，是为了让 CRUD 调用
 *   路径上的 `_emit` 直接走到子类覆写版本，零额外间接层。
 *
 * @template N 节点附带的数据载荷类型
 * @template E 边附带的数据载荷类型
 */
export class Emitter<N = unknown, E = unknown> extends Model<N, E> implements Subscribable<N, E> {
  /** 内置事件总线，承载 {@link Events}（基于 `@opendesign/signal`）。 */
  private readonly _signal = new Signal<Events<N, E>>();

  /**
   * 订阅图变更事件。
   *
   * @template K 事件名
   * @param event 事件名
   * @param listener 回调
   * @returns 取消订阅函数
   *
   * @example
   * ```ts
   * const off = graph.on('edgeAdded', ({ edge }) => console.log(edge.id));
   * off(); // 取消订阅
   * ```
   */
  public on<K extends keyof Events>(
    event: K,
    listener: Listener<Events<N, E>[K]>,
  ): () => void {
    return this._signal.on(event, listener);
  }

  /**
   * 取消订阅指定回调。
   *
   * @template K 事件名
   * @param event 事件名
   * @param listener 之前传给 {@link on} 的回调
   */
  public off<K extends keyof Events>(
    event: K,
    listener: Listener<Events<N, E>[K]>,
  ): void {
    this._signal.off(event, listener);
  }

  /**
   * 覆写 Model 的派发钩子，把事件接入 Signal。
   *
   * @internal
   */
  protected override _emit<K extends keyof Events>(event: K, payload: Events<N, E>[K]): void {
    this._signal.emit(event, payload);
  }
}
