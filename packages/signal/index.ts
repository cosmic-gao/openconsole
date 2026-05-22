/**
 * `@openclound/signal` — 类型安全的事件发射器。
 *
 * 设计要点：
 * - 事件键到载荷类型的映射（`E extends object`）通过 TS 重载逐方法精确推导；
 * - 通配符 `*` 监听全部事件，载荷被联合化（`E[EventType<E>]`）；
 * - `once` 的包装函数通过内部 `WeakMap` 反查到原始 handler，使 `off(type, original)` 仍能正确解绑；
 * - `emit` 在派发期间对监听器列表做浅拷贝，handler 内部 `on/off` 不影响当次派发；
 * - `on` 支持 `AbortSignal`：signal abort 时自动取消订阅；
 * - 实现 `Symbol.dispose`：允许 `using signal = new Signal(...)` 在作用域结束自动 `clear()`。
 *
 * @packageDocumentation
 */

/** 事件名允许的键类型（与 Object 键空间一致）。 */
export type Key = string | symbol;

/** 从事件映射中抽出合法的事件键。 */
export type EventType<E extends object> = Extract<keyof E, Key>;

/** 单事件 handler 签名。 */
export type Handler<T = unknown> = (event: T) => void;

/** 通配符 handler 签名：接收事件名 + 载荷。 */
export type Watcher<E extends object = Record<string, unknown>> = (
  type: EventType<E>,
  event: E[EventType<E>],
) => void;

/** 单事件 handler 与通配符 handler 的联合（注册表元素类型）。 */
export type Listener<E extends object> = Handler<E[EventType<E>]> | Watcher<E>;

/** 监听器注册表：事件键 → handler 列表。 */
export type Registry<E extends object> = Map<EventType<E> | '*', Listener<E>[]>;

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
  rescue?: (error: unknown, type: EventType<E> | '*', handler: Listener<E>) => void;
}

/**
 * Signal 事件发射器接口（独立暴露便于 mock / 依赖注入）。
 */
export interface Emitter<E extends object> {
  /**
   * 全部已注册监听器；按事件名分组。
   *
   * @remarks 主要用于调试 / 反射；正常使用请走 {@link on} / {@link off}。
   */
  readonly all: Registry<E>;

  on<K extends EventType<E>>(type: K, handler: Handler<E[K]>, options?: Options): () => void;
  on(type: '*', handler: Watcher<E>, options?: Options): () => void;

  once<K extends EventType<E>>(type: K, handler: Handler<E[K]>, options?: Omit<Options, 'once'>): () => void;
  once(type: '*', handler: Watcher<E>, options?: Omit<Options, 'once'>): () => void;

  off<K extends EventType<E>>(type: K, handler?: Handler<E[K]>): void;
  off(type: '*', handler?: Watcher<E>): void;

  emit<K extends EventType<E>>(type: K, event: E[K]): boolean;
  emit<K extends EventType<E>>(type: undefined extends E[K] ? K : never): boolean;

  /** {@link on}('*', handler) 的便捷别名。 */
  watch(handler: Watcher<E>, options?: Options): () => void;
  /** {@link off}('*', handler) 的便捷别名。 */
  unwatch(handler?: Watcher<E>): void;

  /** 当前是否存在监听器；不传 `type` 时检查全图。 */
  has(type?: EventType<E> | '*'): boolean;
  /** 指定事件键的监听器数（含 once 包装）。 */
  count(type: EventType<E> | '*'): number;
  /** 所有当前有监听器的事件键。 */
  names(): Array<EventType<E> | '*'>;
  /** 指定事件键的监听器浅拷贝（外部可遍历但不影响内部）。 */
  listeners(type: EventType<E> | '*'): Listener<E>[];

  /** 清空全部监听器。 */
  clear(): void;

  /** Disposable 集成：等价于 {@link clear}。 */
  [Symbol.dispose](): void;
}

/**
 * Signal 事件发射器实现。
 *
 * @template E 事件键 → 载荷类型映射
 *
 * @example 基础用法
 * ```ts
 * interface AppEvents { 'user:login': { id: number }; error: Error; ready: void; }
 *
 * const signal = new Signal<AppEvents>();
 * const off = signal.on('user:login', user => console.log(user.id));
 * signal.emit('user:login', { id: 1 }); // true
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
export class Signal<E extends object = Record<string, unknown>> implements Emitter<E> {
  /** {@inheritdoc Emitter.all} */
  public readonly all: Registry<E> = new Map();

  /**
   * `once` 包装函数 → 原始 handler 的反查表。
   *
   * @remarks 不污染公开类型；`off(type, original)` 通过该映射找到 wrapper 并解绑。
   *   使用 `WeakMap` 让 wrapper 在被 off 后能正常 GC。
   */
  private readonly _wrappers = new WeakMap<object, Listener<E>>();

  private readonly _rescue?: Init<E>['rescue'];

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
   * @returns 取消订阅函数；调用后等价于 {@link off}(type, handler)
   */
  public on<K extends EventType<E>>(type: K, handler: Handler<E[K]>, options?: Options): () => void;
  public on(type: '*', handler: Watcher<E>, options?: Options): () => void;
  public on(type: EventType<E> | '*', handler: Listener<E>, options?: Options): () => void {
    // signal 已 aborted：等价于"立即取消订阅",返回 no-op
    if (options?.signal?.aborted) return noop;

    const real = options?.once ? this._wrap(type, handler) : handler;
    this._add(type, real);

    const unsubscribe = (): void => {
      this._drop(type, real);
    };

    if (options?.signal) {
      options.signal.addEventListener('abort', unsubscribe, { once: true });
    }

    return unsubscribe;
  }

  /**
   * 注册只触发一次的监听器；等价于 {@link on}(type, handler, \{ once: true \})。
   *
   * @remarks
   * 触发前调用 `off(type, original)` 可正常取消（通过内部 WeakMap 反查 wrapper）。
   */
  public once<K extends EventType<E>>(type: K, handler: Handler<E[K]>, options?: Omit<Options, 'once'>): () => void;
  public once(type: '*', handler: Watcher<E>, options?: Omit<Options, 'once'>): () => void;
  public once(type: EventType<E> | '*', handler: Listener<E>, options?: Omit<Options, 'once'>): () => void {
    return this.on(type as never, handler as never, { ...options, once: true });
  }

  /**
   * 取消监听。
   *
   * @param type 事件键或通配符 `'*'`
   * @param handler 处理函数；省略时移除该事件键下的全部监听器
   */
  public off<K extends EventType<E>>(type: K, handler?: Handler<E[K]>): void;
  public off(type: '*', handler?: Watcher<E>): void;
  public off(type: EventType<E> | '*', handler?: Listener<E>): void {
    const list = this.all.get(type);
    if (!list) return;

    if (!handler) {
      this.all.delete(type);
      return;
    }

    // 直接匹配，或通过 _wrappers 反查（针对 once 的 wrapper）
    const index = list.findIndex(
      (h) => h === handler || this._wrappers.get(h as object) === handler,
    );
    if (index === -1) return;

    list.splice(index, 1);
    if (list.length === 0) this.all.delete(type);
  }

  /**
   * 派发事件。
   *
   * @remarks
   * - 派发顺序：**先具体事件 handler，再通配符 handler**；
   * - 派发前对 handler 列表做浅拷贝，handler 内部 `on/off` 不影响当次派发；
   * - 如构造时提供了 {@link Init.rescue}，handler 抛错会被吞到该钩子，emit 继续；
   *   否则异常上抛、中断当次 emit。
   *
   * @returns 是否至少有一个监听器接收（含通配符）
   */
  public emit<K extends EventType<E>>(type: K, event: E[K]): boolean;
  public emit<K extends EventType<E>>(type: undefined extends E[K] ? K : never): boolean;
  public emit<K extends EventType<E>>(type: K, event?: E[K]): boolean {
    let received = false;

    const handlers = this.all.get(type);
    if (handlers && handlers.length > 0) {
      received = true;
      for (const handler of handlers.slice()) {
        this._invoke(handler, type, event, false);
      }
    }

    const wildcards = this.all.get('*');
    if (wildcards && wildcards.length > 0) {
      received = true;
      for (const handler of wildcards.slice()) {
        this._invoke(handler, type, event, true);
      }
    }

    return received;
  }

  /** {@inheritdoc Emitter.watch} */
  public watch(handler: Watcher<E>, options?: Options): () => void {
    return this.on('*', handler, options);
  }

  /** {@inheritdoc Emitter.unwatch} */
  public unwatch(handler?: Watcher<E>): void {
    this.off('*', handler);
  }

  /** {@inheritdoc Emitter.has} */
  public has(type?: EventType<E> | '*'): boolean {
    if (type === undefined) return this.all.size > 0;
    const list = this.all.get(type);
    return list !== undefined && list.length > 0;
  }

  /** {@inheritdoc Emitter.count} */
  public count(type: EventType<E> | '*'): number {
    return this.all.get(type)?.length ?? 0;
  }

  /** {@inheritdoc Emitter.names} */
  public names(): Array<EventType<E> | '*'> {
    return Array.from(this.all.keys());
  }

  /** {@inheritdoc Emitter.listeners} */
  public listeners(type: EventType<E> | '*'): Listener<E>[] {
    const list = this.all.get(type);
    return list ? list.slice() : [];
  }

  /** 清空所有监听器。 */
  public clear(): void {
    this.all.clear();
  }

  /** {@link clear} 的 Disposable 别名（`using signal = new Signal()` 生效）。 */
  public [Symbol.dispose](): void {
    this.clear();
  }

  /**
   * 包装 handler 为 once 形态：派发时先解绑自己，再调用原 handler。
   *
   * @remarks 先解绑再调用：即便原 handler 抛错，wrapper 也已经从注册表移除，不会泄漏。
   *
   * @internal
   */
  private _wrap(type: EventType<E> | '*', handler: Listener<E>): Listener<E> {
    const wrapper = ((...args: unknown[]): void => {
      this._drop(type, wrapper);
      (handler as (...args: unknown[]) => void)(...args);
    }) as Listener<E>;
    this._wrappers.set(wrapper, handler);
    return wrapper;
  }

  /** 把 handler push 到 type 的列表。 */
  private _add(type: EventType<E> | '*', handler: Listener<E>): void {
    const list = this.all.get(type);
    if (list) {
      list.push(handler);
    } else {
      this.all.set(type, [handler]);
    }
  }

  /**
   * 用引用相等精确移除（不走 _wrappers 反查；用于 unsubscribe / once wrapper 自卸）。
   *
   * @internal
   */
  private _drop(type: EventType<E> | '*', handler: Listener<E>): void {
    const list = this.all.get(type);
    if (!list) return;
    const index = list.indexOf(handler);
    if (index === -1) return;
    list.splice(index, 1);
    if (list.length === 0) this.all.delete(type);
  }

  /**
   * 安全调用单个 handler，按构造选项处理异常。
   *
   * @internal
   */
  private _invoke(
    handler: Listener<E>,
    type: EventType<E>,
    event: E[EventType<E>] | undefined,
    wildcard: boolean,
  ): void {
    try {
      if (wildcard) {
        (handler as Watcher<E>)(type, event as E[EventType<E>]);
      } else {
        (handler as Handler<E[EventType<E>]>)(event as E[EventType<E>]);
      }
    } catch (error) {
      if (this._rescue) {
        this._rescue(error, wildcard ? '*' : type, handler);
      } else {
        throw error;
      }
    }
  }
}

/** 空 unsubscribe 函数,复用避免不必要的闭包分配。 */
const noop = (): void => {
  /* intentionally empty */
};

export default Signal;
