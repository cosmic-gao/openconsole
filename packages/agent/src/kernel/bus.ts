/**
 * 插件事件总线 —— 基于 `@openconsole/signal` 的强类型 pub/sub。
 *
 * 与 {@link ./event} 的流管道分工明确：
 *  - `event.ts` 的 `Channel`/`toEvents` 是**面向调用方的带背压单消费者流**（`session.stream` 消费）；
 *  - 本 bus 是**面向插件/观测者的无背压多订阅**（对标 opencode 的 event bus + `event` hook）。
 *
 * 复用 `event.ts` 的 {@link Event} 联合作为载荷：事件键 = `Event["type"]` 判别值，
 * 载荷 = 对应的 Event 分支。"plugins" 中间件向它 `emit`，插件 `api.hook("event", …)` 订阅。
 */
import { Signal } from "@openconsole/signal";

import type { Event } from "./event";

/** 事件键 → 载荷映射：每个 `Event["type"]` 一个键，载荷为对应的 Event 分支。 */
export type BusEvents = { [K in Event["type"]]: Extract<Event, { type: K }> };

/**
 * 造一个新的事件总线。`rescue` 让单个 handler 抛错被吞掉、emit 继续向后派发
 * （"观察总线"语义：一个插件的 event handler 出错不应中断其余订阅者）。
 */
export function createBus(): Signal<BusEvents> {
  return new Signal<BusEvents>({
    rescue: (error, type) =>
      console.error(
        `[@openconsole/agent] event handler for "${String(type)}" threw`,
        error,
      ),
  });
}

/** 进程级共享事件总线（与 {@link manager} 默认绑定）。 */
export const bus = createBus();
