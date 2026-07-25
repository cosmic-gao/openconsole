/**
 * `@openconsole/signal` — 类型安全的事件发射器。
 *
 * 设计要点：
 * - 事件键到载荷类型的映射（`E extends object`）通过重载与条件类型逐方法精确推导；
 * - 具体事件 handler 与通配符 watcher **分桶存储**，派发路径上不存在两者的联合类型，
 *   因此无需在调用点把载荷断言回具体类型；
 * - `Watcher` 是泛型签名（`<K>(type: K, event: E[K])`），键与载荷保持相关；
 * - `emit` 的载荷走可变长元组 {@link Payload}：只有载荷域包含 `undefined` 的事件才允许省略实参；
 * - `once` 的包装函数通过内部 `WeakMap` 反查原始 handler，使 `off(type, original)` 仍能正确解绑；
 * - `emit` 在派发期间对监听器列表做快照，handler 内部 `on/off` 不影响当次派发；
 * - `on` 支持 `AbortSignal`：abort 时自动取消订阅，且**任何**移除路径都会摘掉 abort 监听，
 *   长生命周期的 `AbortSignal` 上不会堆积监听器；
 * - 实现 `Symbol.dispose`：允许 `using signal = new Signal(...)` 在作用域结束自动 `clear()`。
 *
 * @packageDocumentation
 */

/** 事件名允许的键类型（与 Object 键空间一致）。 */
export type Key = string | symbol;

/** 通配符键：匹配全部事件。 */
export type Wildcard = "*";

/** 从事件映射中抽出合法的事件键。 */
export type EventType<E extends object> = Extract<keyof E, Key>;

/** 单事件 handler 签名。 */
export type Handler<T = unknown> = (event: T) => void;

/**
 * 通配符 handler 签名：接收事件名与其对应载荷。
 *
 * @remarks 泛型 `K` 让「键」与「载荷」保持相关，派发侧可以直接以具体键调用，
 *   无需先把载荷退化成全键联合再断言。消费侧写 `(type, event) => ...` 时
 *   `K` 实例化为 `EventType<E>`，载荷即全键联合，与直觉一致。
 */
export type Watcher<E extends object = Record<string, unknown>> = <
  K extends EventType<E>,
>(
  type: K,
  event: E[K],
) => void;

/** 单事件 handler 与通配符 handler 的联合（对外描述监听器时使用）。 */
export type Listener<E extends object> = Handler<E[EventType<E>]> | Watcher<E>;

/**
 * {@link Emitter.emit} 的载荷实参。
 *
 * @remarks 载荷域包含 `undefined`（`void` 或 `T | undefined`）时第二个实参可省略，
 *   否则必填——省略与多传都是编译错误。
 */
export type Payload<
  E extends object,
  K extends EventType<E>,
> = undefined extends E[K] ? [event?: E[K]] : [event: E[K]];

/** 取消订阅函数；重复调用无副作用。 */
export type Unsubscribe = () => void;

/**
 * 监听器注册表快照：只读，外部无法借此改动内部状态。
 *
 * @see {@link Emitter.snapshot}
 */
export type Registry<E extends object> = ReadonlyMap<
  EventType<E> | Wildcard,
  ReadonlyArray<Listener<E>>
>;

/**
 * `on` / `once` / `watch` 接受的可选项。
 */
export interface Options {
  /**
   * 关联一个 {@link AbortSignal}：abort 时自动取消订阅。
   *
   * @remarks 若传入的 signal 在 `on()` 调用时已经 aborted，则 handler 永不注册。
   */
  signal?: AbortSignal;

  /** 一次性触发：handler 派发一次后自动 off。等价 {@link Emitter.once}。 */
  once?: boolean;
}

/**
 * Signal 构造选项（Web API 风格的 `*Init`）。
 */
export interface Init<E extends object> {
  /**
   * handler 抛错时的钩子。
   *
   * @remarks
   * - 缺省：将异常上抛（中断当次 `emit` 的剩余 handler 派发）；
   * - 提供时：异常吞到该钩子里，**`emit` 继续向后派发**，方便观察总线类场景。
   */
  rescue?: (
    error: unknown,
    type: EventType<E> | Wildcard,
    handler: Listener<E>,
  ) => void;
}

/**
 * Signal 事件发射器接口（独立暴露便于 mock / 依赖注入）。
 */
export interface Emitter<E extends object> {
  on<K extends EventType<E>>(
    type: K,
    handler: Handler<E[K]>,
    options?: Options,
  ): Unsubscribe;
  on(type: Wildcard, handler: Watcher<E>, options?: Options): Unsubscribe;

  once<K extends EventType<E>>(
    type: K,
    handler: Handler<E[K]>,
    options?: Omit<Options, "once">,
  ): Unsubscribe;
  once(
    type: Wildcard,
    handler: Watcher<E>,
    options?: Omit<Options, "once">,
  ): Unsubscribe;

  off<K extends EventType<E>>(type: K, handler?: Handler<E[K]>): void;
  off(type: Wildcard, handler?: Watcher<E>): void;

  emit<K extends EventType<E>>(type: K, ...payload: Payload<E, K>): boolean;

  /** {@link Emitter.on}('*', handler) 的便捷别名。 */
  watch(handler: Watcher<E>, options?: Options): Unsubscribe;
  /** {@link Emitter.off}('*', handler) 的便捷别名。 */
  unwatch(handler?: Watcher<E>): void;

  /** 当前是否存在监听器；不传 `type` 时检查全图。 */
  has(type?: EventType<E> | Wildcard): boolean;
  /** 指定事件键的监听器数（含 once 包装）。 */
  count(type: EventType<E> | Wildcard): number;
  /** 所有当前有监听器的事件键；通配符（若有监听器）排在末位。 */
  names(): Array<EventType<E> | Wildcard>;
  /** 指定事件键的监听器浅拷贝（外部可遍历但不影响内部）。 */
  listeners(type: EventType<E> | Wildcard): Listener<E>[];
  /** 全部监听器的只读快照；调试 / 反射用。 */
  snapshot(): Registry<E>;

  /** 清空全部监听器。 */
  clear(): void;

  /** Disposable 集成：等价于 {@link Emitter.clear}。 */
  [Symbol.dispose](): void;
}

/**
 * Signal 事件发射器实现。
 *
 * @typeParam E - 事件键 → 载荷类型映射
 *
 * @example 基础用法
 * ```ts
 * interface AppEvents { 'user:login': { id: number }; error: Error; ready: void; }
 *
 * const signal = new Signal<AppEvents>();
 * const off = signal.on('user:login', user => console.log(user.id));
 * signal.emit('user:login', { id: 1 }); // true
 * signal.emit('ready');                 // void 载荷可省略实参
 * off();
 * ```
 *
 * @example AbortSignal 集成
 * ```ts
 * const ac = new AbortController();
 * signal.on('ready', handler, { signal: ac.signal });
 * ac.abort(); // 自动 off
 * ```
 *
 * @example Disposable 资源管理
 * ```ts
 * {
 *   using signal = new Signal<AppEvents>();
 *   signal.on('ready', handler);
 * } // 作用域结束自动 clear()
 * ```
 */
export class Signal<
  E extends object = Record<string, unknown>,
> implements Emitter<E> {
  /**
   * 具体事件的 handler 桶。
   *
   * @remarks 元素按「全部载荷的联合」存储：TS 无法表达「键与载荷相关」的异构容器，
   *   写入侧在 {@link Signal._push} 收口为唯一一处断言；读出侧因联合是各键载荷的超集，
   *   直接调用即类型安全。
   */
  private readonly _handlers = new Map<
    EventType<E>,
    Array<Handler<E[EventType<E>]>>
  >();

  /** 通配符监听器；与 handler 分桶，避免派发路径上出现联合类型。 */
  private readonly _watchers: Array<Watcher<E>> = [];

  /**
   * `once` 包装函数 → 原始 handler 的反查表。
   *
   * @remarks 不污染公开类型；`off(type, original)` 通过该映射找到 wrapper 并解绑。
   *   使用 `WeakMap` 让 wrapper 在被 off 后能正常 GC。
   */
  private readonly _origins = new WeakMap<object, object>();

  /**
   * 监听器 → 解除其 `AbortSignal` 联动。
   *
   * @remarks 所有移除路径（unsubscribe / off / once 自卸 / clear）都会调用，
   *   保证长生命周期的 `AbortSignal` 上不残留 abort 监听。
   */
  private readonly _detach = new WeakMap<object, Unsubscribe>();

  private readonly _rescue: Init<E>["rescue"];

  /**
   * @param init 构造选项；省略时使用默认行为（handler 抛错会中断 emit）
   */
  public constructor(init?: Init<E>) {
    this._rescue = init?.rescue;
  }

  /**
   * 注册事件监听器。
   *
   * @param type 事件键或通配符 `'*'`
   * @param handler 处理函数
   * @param options 可选 {@link Options}
   * @returns 取消订阅函数；调用后等价于 {@link Signal.off}(type, handler)，重复调用无副作用
   */
  public on<K extends EventType<E>>(
    type: K,
    handler: Handler<E[K]>,
    options?: Options,
  ): Unsubscribe;
  public on(
    type: Wildcard,
    handler: Watcher<E>,
    options?: Options,
  ): Unsubscribe;
  public on(
    type: EventType<E> | Wildcard,
    handler: Listener<E>,
    options?: Options,
  ): Unsubscribe {
    return this._route(type, handler, options);
  }

  /**
   * 注册只触发一次的监听器；等价于 {@link Signal.on}(type, handler, \{ once: true \})。
   *
   * @remarks 触发前调用 `off(type, original)` 可正常取消（通过内部 WeakMap 反查 wrapper）。
   */
  public once<K extends EventType<E>>(
    type: K,
    handler: Handler<E[K]>,
    options?: Omit<Options, "once">,
  ): Unsubscribe;
  public once(
    type: Wildcard,
    handler: Watcher<E>,
    options?: Omit<Options, "once">,
  ): Unsubscribe;
  public once(
    type: EventType<E> | Wildcard,
    handler: Listener<E>,
    options?: Omit<Options, "once">,
  ): Unsubscribe {
    return this._route(type, handler, { ...options, once: true });
  }

  /**
   * 取消监听。
   *
   * @param type 事件键或通配符 `'*'`
   * @param handler 处理函数；省略时移除该事件键下的全部监听器
   */
  public off<K extends EventType<E>>(type: K, handler?: Handler<E[K]>): void;
  public off(type: Wildcard, handler?: Watcher<E>): void;
  public off(type: EventType<E> | Wildcard, handler?: Listener<E>): void {
    if (type === "*") {
      this._forget(handler);
      return;
    }

    const list = this._handlers.get(type);
    if (list === undefined) return;

    if (handler === undefined) {
      for (const entry of list) this._release(entry);
      this._handlers.delete(type);
      return;
    }

    const index = this._locate(list, handler);
    if (index === -1) return;
    const [dropped] = list.splice(index, 1);
    if (dropped !== undefined) this._release(dropped);
    if (list.length === 0) this._handlers.delete(type);
  }

  /**
   * 派发事件。
   *
   * @remarks
   * - 派发顺序：**先具体事件 handler，再通配符 handler**；
   * - 派发前对监听器列表取快照，handler 内部 `on/off` 不影响当次派发；
   * - 如构造时提供了 {@link Init.rescue}，handler 抛错会被吞到该钩子，emit 继续；
   *   否则异常上抛、中断当次 emit。
   *
   * @param type 事件键
   * @param payload 事件载荷；仅当载荷域包含 `undefined` 时可省略（见 {@link Payload}）
   * @returns 是否至少有一个监听器接收（含通配符）
   */
  public emit<K extends EventType<E>>(
    type: K,
    ...payload: Payload<E, K>
  ): boolean;
  public emit(type: EventType<E>, ...payload: [event?: unknown]): boolean {
    // Payload 的条件类型保证：仅当该键载荷域包含 undefined 时实参才可省略，
    // 因此这里取到的值（含 undefined）一定落在合法载荷域内。
    const event = payload[0] as E[EventType<E>];
    let received = false;

    const list = this._handlers.get(type);
    if (list !== undefined && list.length > 0) {
      received = true;
      // 单监听器是最常见情形，直接调用以省掉一次快照数组分配。
      if (list.length === 1) {
        const only = list[0];
        if (only !== undefined) this._dispatch(only, type, event);
      } else {
        for (const handler of [...list]) this._dispatch(handler, type, event);
      }
    }

    if (this._watchers.length > 0) {
      received = true;
      if (this._watchers.length === 1) {
        const only = this._watchers[0];
        if (only !== undefined) this._notify(only, type, event);
      } else {
        for (const watcher of [...this._watchers]) {
          this._notify(watcher, type, event);
        }
      }
    }

    return received;
  }

  /** {@inheritDoc Emitter.watch} */
  public watch(handler: Watcher<E>, options?: Options): Unsubscribe {
    return this._bind<Watcher<E>>(
      handler,
      (fire) => (type, event) => {
        fire();
        handler(type, event);
      },
      (entry) => {
        this._watchers.push(entry);
      },
      (entry) => {
        if (remove(this._watchers, entry)) this._release(entry);
      },
      options,
    );
  }

  /** {@inheritDoc Emitter.unwatch} */
  public unwatch(handler?: Watcher<E>): void {
    this._forget(handler);
  }

  /** {@inheritDoc Emitter.has} */
  public has(type?: EventType<E> | Wildcard): boolean {
    if (type === undefined) {
      return this._handlers.size > 0 || this._watchers.length > 0;
    }
    if (type === "*") return this._watchers.length > 0;
    const list = this._handlers.get(type);
    return list !== undefined && list.length > 0;
  }

  /** {@inheritDoc Emitter.count} */
  public count(type: EventType<E> | Wildcard): number {
    if (type === "*") return this._watchers.length;
    return this._handlers.get(type)?.length ?? 0;
  }

  /** {@inheritDoc Emitter.names} */
  public names(): Array<EventType<E> | Wildcard> {
    const result: Array<EventType<E> | Wildcard> = [...this._handlers.keys()];
    if (this._watchers.length > 0) result.push("*");
    return result;
  }

  /** {@inheritDoc Emitter.listeners} */
  public listeners(type: EventType<E> | Wildcard): Listener<E>[] {
    if (type === "*") return [...this._watchers];
    const list = this._handlers.get(type);
    return list === undefined ? [] : [...list];
  }

  /** {@inheritDoc Emitter.snapshot} */
  public snapshot(): Registry<E> {
    const result = new Map<
      EventType<E> | Wildcard,
      ReadonlyArray<Listener<E>>
    >();
    for (const [type, list] of this._handlers) result.set(type, [...list]);
    if (this._watchers.length > 0) result.set("*", [...this._watchers]);
    return result;
  }

  /** 清空所有监听器（并解除全部 `AbortSignal` 联动）。 */
  public clear(): void {
    for (const list of this._handlers.values()) {
      for (const entry of list) this._release(entry);
    }
    for (const entry of this._watchers) this._release(entry);
    this._handlers.clear();
    this._watchers.length = 0;
  }

  /** {@link Signal.clear} 的 Disposable 别名（`using signal = new Signal()` 生效）。 */
  public [Symbol.dispose](): void {
    this.clear();
  }

  /**
   * `on` / `once` 的公共派路：按 type 分流到通配符桶或具体事件桶。
   *
   * @remarks 重载签名保证了 `type` 与 `handler` 的对应关系，但实现签名无法表达这种
   *   相关性（两个独立形参之间没有可判别的联系），故此处是两处必要断言。
   */
  private _route(
    type: EventType<E> | Wildcard,
    handler: Listener<E>,
    options: Options | undefined,
  ): Unsubscribe {
    if (type === "*") return this.watch(handler as Watcher<E>, options);
    return this._listen(type, handler as Handler<E[EventType<E>]>, options);
  }

  /** 注册具体事件监听器。 */
  private _listen<K extends EventType<E>>(
    type: K,
    handler: Handler<E[K]>,
    options?: Options,
  ): Unsubscribe {
    return this._bind<Handler<E[K]>>(
      handler,
      (fire) => (event: E[K]) => {
        fire();
        handler(event);
      },
      (entry) => {
        this._push(type, entry);
      },
      (entry) => {
        this._pull(type, entry);
      },
      options,
    );
  }

  /**
   * 订阅公共外壳：once 包装、`AbortSignal` 联动与幂等 unsubscribe 都在这里收口。
   *
   * @param handler 原始监听器
   * @param wrap 构造 once 包装：`fire` 会先解绑再交给原 handler
   * @param add 把最终 entry 写入对应桶
   * @param remove 把最终 entry 从对应桶移除（并释放其 abort 联动）
   */
  private _bind<L extends object>(
    handler: L,
    wrap: (fire: Unsubscribe) => L,
    add: (entry: L) => void,
    remove: (entry: L) => void,
    options: Options | undefined,
  ): Unsubscribe {
    const signal = options?.signal;
    // signal 已 aborted：等价于「立即取消订阅」，返回 no-op
    if (signal?.aborted) return noop;

    let dispose: Unsubscribe = noop;
    // once 包装先解绑再调用原 handler：即便原 handler 抛错也不会残留注册。
    const entry: L = options?.once ? wrap(() => dispose()) : handler;
    if (entry !== handler) this._origins.set(entry, handler);

    add(entry);

    let active = true;
    dispose = (): void => {
      if (!active) return;
      active = false;
      remove(entry);
    };

    if (signal !== undefined) {
      const abort = (): void => {
        dispose();
      };
      signal.addEventListener("abort", abort, { once: true });
      this._detach.set(entry, () => {
        signal.removeEventListener("abort", abort);
      });
    }

    return dispose;
  }

  /**
   * 写入 handler 桶。
   *
   * @remarks 这是「键 → 载荷」相关性丢失的唯一一处：桶按全键载荷联合存储，
   *   而 TS 无法表达异构容器的键值相关性。读出侧无需断言。
   */
  private _push<K extends EventType<E>>(type: K, entry: Handler<E[K]>): void {
    const widened = entry as Handler<E[EventType<E>]>;
    const list = this._handlers.get(type);
    if (list === undefined) this._handlers.set(type, [widened]);
    else list.push(widened);
  }

  /** 按引用相等从 handler 桶移除（用于 unsubscribe / once 自卸）。 */
  private _pull<K extends EventType<E>>(type: K, entry: Handler<E[K]>): void {
    const list = this._handlers.get(type);
    if (list === undefined) return;
    if (!remove(list, entry)) return;
    this._release(entry);
    if (list.length === 0) this._handlers.delete(type);
  }

  /** 移除通配符监听器；`handler` 省略时清空全部。 */
  private _forget(handler?: unknown): void {
    if (handler === undefined) {
      for (const entry of this._watchers) this._release(entry);
      this._watchers.length = 0;
      return;
    }
    const index = this._locate(this._watchers, handler);
    if (index === -1) return;
    const [dropped] = this._watchers.splice(index, 1);
    if (dropped !== undefined) this._release(dropped);
  }

  /** 定位监听器：直接引用相等，或经 {@link Signal._origins} 反查 once 包装。 */
  private _locate<L extends Listener<E>>(
    list: readonly L[],
    handler: unknown,
  ): number {
    return list.findIndex(
      (entry) => entry === handler || this._origins.get(entry) === handler,
    );
  }

  /** 解除监听器的 `AbortSignal` 联动（若有）。 */
  private _release(entry: object): void {
    const detach = this._detach.get(entry);
    if (detach === undefined) return;
    this._detach.delete(entry);
    detach();
  }

  /** 调用具体事件 handler，按构造选项处理异常。 */
  private _dispatch(
    handler: Handler<E[EventType<E>]>,
    type: EventType<E>,
    event: E[EventType<E>],
  ): void {
    try {
      handler(event);
    } catch (error) {
      this._fail(error, type, handler);
    }
  }

  /** 调用通配符 handler，按构造选项处理异常。 */
  private _notify(
    watcher: Watcher<E>,
    type: EventType<E>,
    event: E[EventType<E>],
  ): void {
    try {
      watcher(type, event);
    } catch (error) {
      this._fail(error, "*", watcher);
    }
  }

  /** 无 rescue 钩子时上抛，中断当次 emit；否则吞到钩子里继续派发。 */
  private _fail(
    error: unknown,
    type: EventType<E> | Wildcard,
    handler: Listener<E>,
  ): void {
    if (this._rescue === undefined) throw error;
    this._rescue(error, type, handler);
  }
}

/** 按引用相等移除首个匹配元素；返回是否命中。 */
function remove<T>(list: T[], entry: unknown): boolean {
  const index = list.findIndex((item) => item === entry);
  if (index === -1) return false;
  list.splice(index, 1);
  return true;
}

/** 空 unsubscribe 函数，复用避免不必要的闭包分配。 */
const noop: Unsubscribe = () => {
  /* intentionally empty */
};
