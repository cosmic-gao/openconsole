/**
 * Emitter：类型化的图变更事件总线（封装 `@opendesign/signal`）。
 */

import { Signal } from '@opendesign/signal';

import type { Events, Listener } from '../types';

/**
 * 类型化的图变更事件总线，按 {@link Events} 形状约束载荷。
 *
 * @remarks 与 `Signal` 的区别仅在于把泛型固化为 `Events<N, E>`，使 `on / emit`
 *   的事件名与载荷在编译期获得强约束。{@link Model} 通过组合持有一个 Emitter
 *   实例并把 `on / off` facade 出去。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export class Emitter<N = unknown, E = unknown> {
  private readonly _signal = new Signal<Events<N, E>>();

  /**
   * 订阅事件。
   *
   * @template K 事件名
   * @param event 事件名
   * @param listener 回调
   * @returns 取消订阅函数
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

  /** 同步派发事件给所有订阅者。 */
  public emit<K extends keyof Events>(event: K, payload: Events<N, E>[K]): void {
    this._signal.emit(event, payload);
  }
}
