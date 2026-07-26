/**
 * Hook 引擎:类型化、多策略,派发计划由 {@link Pipeline} 编译。
 *
 *  - {@link SeriesHook}    串行副作用;
 *  - {@link ParallelHook}  层内并发、层间有序;
 *  - {@link WaterfallHook} 链式改写:输出顺着 taps 依次传递;
 *  - {@link BailHook}      熔断:首个返回非空结果的 tap 胜出并短路。
 *
 * 一个 hook 的 taps 是一条流水线:每个 tap 是图上一个节点,`before` / `after` 是边,派发顺序是
 * 拓扑序,互不依赖的 tap 落在同一层。
 *
 * `call()` 不排序、不过滤、不分配 —— 只顺序遍历一个已冻结的计划。计划取一次用整趟,因此派发
 * 中途注册 / 注销的 tap 落到下一次,正在跑的循环不会跳项。过滤条件在 `tap()` 时就编译成单个
 * 谓词,热路径上每个 tap 最多付一次判断。
 */

import { compile, type Filter, type Predicate } from "./filter";
import { Pipeline, type Plan, type Step } from "./pipeline";

/**
 * 顺序权重来源。{@link PluginManager} 注入插件的图序,于是同层 tap 的次序就是插件的拓扑序;
 * 独立使用 hook 时退化为常量,排序只看 `stage`、`before` / `after` 与注册序。
 */
export interface Ranking {
  /** 版本号:变了说明权重已改,派发计划要重排。 */
  readonly epoch: number;
  weight(name: string): number;
}

const FLAT: Ranking = { epoch: 0, weight: () => 0 };

/** 常用 `stage` 常量。数值越小越先执行,留出间隙便于插进中间。 */
export const Stage = { pre: -10, default: 0, post: 10 } as const;

/**
 * 派发探针:每个 tap 执行前调一次;返回的收尾回调在该 tap 结束时调用(出错则带上错误)。
 * 计时与归因用 —— 「哪个插件的哪个 tap 慢 / 抛了」。
 *
 * @example
 * ```ts
 * hook.probe = (hook, tap) => {
 *   const at = performance.now();
 *   return (error) => void report(hook, tap, performance.now() - at, error);
 * };
 * ```
 */
export type Probe = (hook: string, tap: string) => ((error?: unknown) => void) | void;

/** 单个 tap 抛错时的处理;不给则错误直接抛出、阻断派发。 */
export type OnError = (error: unknown, tap: string) => void;

export interface HookOptions {
  /** 错误隔离:给了就交给它,不给则抛出。 */
  onError?: OnError | undefined;
  probe?: Probe | undefined;
}

/** tap 注册选项。 */
export interface TapOptions<I> {
  /** 来源标识:排序权重、`before` / `after` 的引用名、卸载分组;经 {@link PluginManager} 注册时恒为插件名。 */
  name?: string | undefined;
  /** 硬分相,数值越小越先;默认 0。见 {@link Stage}。 */
  stage?: number | undefined;
  /** 本 tap 须**先于**这些名字的 tap;同名的全部命中,引用不存在的名字则忽略。 */
  before?: string | readonly string[] | undefined;
  /** 本 tap 须**后于**这些名字的 tap;同名的全部命中,引用不存在的名字则忽略。 */
  after?: string | readonly string[] | undefined;
  /** 命中条件:声明式条件对象或谓词。省略则每次派发都执行。 */
  filter?: Filter<I> | undefined;
}

/** tap 的自省视图,按派发顺序给出。 */
export interface TapEntry<I> {
  readonly name: string;
  readonly stage: number;
  /** 同 `(stage, layer)` 的 tap 互不依赖 —— {@link ParallelHook} 会把它们放进同一层并发。 */
  readonly layer: number;
  /** 原样的注册条件 —— 声明式的那种可打印、可比较、可序列化。 */
  readonly filter: Filter<I> | undefined;
}

interface Tap<F, I> extends Step {
  readonly fn: F;
  readonly filter: Filter<I> | undefined;
  /** 编译好的谓词;无条件时为 `undefined`,派发连判断都省掉。 */
  readonly gate: Predicate<I> | undefined;
  readonly seq: number;
}

const list = (value: string | readonly string[] | undefined): readonly string[] | undefined =>
  value === undefined ? undefined : typeof value === "string" ? [value] : value;

/** 只对真正的 thenable 付 `await` —— 同步 tap 不该白搭一个微任务。 */
const thenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | null)?.then === "function";

/**
 * 钩子基类:管理 tap 注册与派发计划。派发语义见各子类的 `call()`。
 *
 * @template F tap 回调签名
 * @template I 派发输入类型(filter 的入参)
 */
export abstract class Hook<F extends (...args: any[]) => unknown, I> {
  private readonly pipeline: Pipeline<Tap<F, I>>;
  private ranking: Ranking = FLAT;
  private counter = 0;

  protected readonly onError: OnError | undefined;
  public probe: Probe | undefined;

  public constructor(
    public readonly name: string,
    options: HookOptions = {},
  ) {
    this.onError = options.onError;
    this.probe = options.probe;
    this.pipeline = new Pipeline<Tap<F, I>>(`hook:${name}`, {
      subject: `hook "${name}" 的 tap 顺序`,
      tiebreak: (a, b) =>
        this.ranking.weight(a.name) - this.ranking.weight(b.name) || a.seq - b.seq,
      epoch: () => this.ranking.epoch,
    });
  }

  /** 返回 un-tap。 */
  public tap(options: TapOptions<I>, fn: F): () => void {
    const seq = this.counter++;
    const name = options.name ?? "anonymous";
    const tap: Tap<F, I> = {
      fn,
      // 同一个插件可以在同一个 hook 上 tap 多次,故 key 要带序号。
      key: `${name}#${seq}`,
      name,
      bucket: options.stage ?? 0,
      before: list(options.before),
      after: list(options.after),
      filter: options.filter,
      gate: compile(options.filter),
      seq,
    };
    this.pipeline.add(tap);
    return () => void this.pipeline.remove(tap.key);
  }

  public get size(): number {
    return this.pipeline.size;
  }

  /** 自省:按派发顺序列出全部 tap 及其分层与命中条件。 */
  public entries(): ReadonlyArray<TapEntry<I>> {
    const plan = this.plan();
    return plan.order.map((tap) => ({
      name: tap.name,
      stage: tap.bucket,
      layer: plan.at.get(tap.key)?.layer ?? 0,
      filter: tap.filter,
    }));
  }

  /**
   * 校验 tap 之间的先后声明。{@link PluginManager} 在装配边界上调用 —— 派发时不再有意外。
   *
   * @throws {@link CycleError} `before` / `after` 成环
   * @throws {@link PhaseError} 先后声明与 `stage` 分相矛盾
   */
  public verify(): void {
    this.pipeline.verify();
  }

  /** 注入顺序权重;由 {@link PluginManager} 在构造时调用。 */
  public weigh(ranking: Ranking): void {
    this.ranking = ranking;
    this.pipeline.invalidate();
  }

  /** 取派发计划。取一次用整趟。 */
  protected plan(): Plan<Tap<F, I>> {
    return this.pipeline.plan();
  }

  /** 有 `onError` 就交给它(隔离),否则抛出(阻断)。 */
  protected raise(error: unknown, tap: string): void {
    if (!this.onError) throw error;
    this.onError(error, tap);
  }
}

/** 串行副作用:逐个执行并等待;同步 tap 不付微任务。 */
export class SeriesHook<I> extends Hook<(input: I) => void | Promise<void>, I> {
  public async call(input: I): Promise<void> {
    for (const tap of this.plan().order) {
      if (tap.gate && !tap.gate(input)) continue;
      const done = this.probe?.(this.name, tap.name);
      try {
        const returned = tap.fn(input);
        if (thenable(returned)) await returned;
        done?.();
      } catch (error) {
        done?.(error);
        this.raise(error, tap.name);
      }
    }
  }
}

/**
 * 分层并发的副作用:层内并发、层间有序。谁都没声明 `before` / `after` 且 `stage` 相同时只有
 * 一层,退化成「全部并发」。
 *
 * 任一 tap 失败:有 `onError` 则逐个交给它并继续往下层跑;否则跑完当前层就停下(后面的层正是
 * 声明了要等这一层的),多个失败聚成 `AggregateError`,不静默丢弃。
 */
export class ParallelHook<I> extends Hook<(input: I) => void | Promise<void>, I> {
  public async call(input: I): Promise<void> {
    const failures: Array<{ error: unknown; tap: string }> = [];

    for (const layer of this.plan().layers) {
      const running: Array<Promise<void>> = [];
      for (const tap of layer) {
        if (tap.gate && !tap.gate(input)) continue;
        const done = this.probe?.(this.name, tap.name);
        const fail = (error: unknown): void => {
          done?.(error);
          failures.push({ error, tap: tap.name });
        };
        try {
          const returned = tap.fn(input);
          if (thenable(returned)) running.push(Promise.resolve(returned).then(() => void done?.(), fail));
          else done?.();
        } catch (error) {
          fail(error);
        }
      }
      // 每个分支自带 catch,故这里不会 reject —— 不留悬空拒绝。
      if (running.length > 0) await Promise.all(running);
      if (failures.length > 0 && !this.onError) break;
    }

    if (failures.length === 0) return;
    if (this.onError) {
      for (const { error, tap } of failures) this.onError(error, tap);
      return;
    }
    if (failures.length === 1) throw failures[0]!.error;
    throw new AggregateError(
      failures.map(({ error }) => error),
      `hook "${this.name}" 有 ${failures.length} 个 tap 失败: ${failures.map(({ tap }) => tap).join(", ")}`,
    );
  }
}

/**
 * 注入式 produce(immer 兼容签名):提供则走不可变快照,省略则原地改写。
 *
 * @example
 * ```ts
 * import { produce } from "immer";
 * new WaterfallHook("transform", { produce });
 * ```
 */
export type Produce<O> = (base: O, recipe: (draft: O) => void | O | Promise<void | O>) => O | Promise<O>;

export interface WaterfallOptions<O> extends HookOptions {
  produce?: Produce<O> | undefined;
}

/**
 * 链式改写:`output` 顺着 taps 依次传递,每个 tap 改 `output` 或 `return` 新值替换(二选一,
 * 勿同时)。注入 {@link Produce} 走不可变快照,否则原地改写。
 *
 * @template I 只读输入(filter / 上下文)
 * @template O 被改写的输出
 */
export class WaterfallHook<I, O> extends Hook<(input: I, output: O) => void | O | Promise<void | O>, I> {
  private readonly produce: Produce<O> | undefined;

  public constructor(name: string, options: WaterfallOptions<O> = {}) {
    super(name, options);
    this.produce = options.produce;
  }

  public async call(input: I, output: O): Promise<O> {
    let current = output;
    for (const tap of this.plan().order) {
      if (tap.gate && !tap.gate(input)) continue;
      const done = this.probe?.(this.name, tap.name);
      try {
        if (this.produce) {
          current = await this.produce(current, (draft) => tap.fn(input, draft));
        } else {
          const returned = tap.fn(input, current);
          const replaced = thenable(returned) ? await returned : returned;
          if (replaced !== undefined) current = replaced as O;
        }
        done?.();
      } catch (error) {
        done?.(error);
        // 隔离时保留上一轮的 current:失败的 tap 不改写,不污染下游。
        this.raise(error, tap.name);
      }
    }
    return current;
  }
}

/** 熔断:首个返回非空(非 `undefined` / `null`)的 tap 胜出并短路;其余不执行。 */
export class BailHook<I, R> extends Hook<(input: I) => R | undefined | null | Promise<R | undefined | null>, I> {
  public async call(input: I): Promise<R | undefined> {
    for (const tap of this.plan().order) {
      if (tap.gate && !tap.gate(input)) continue;
      const done = this.probe?.(this.name, tap.name);
      try {
        const returned = tap.fn(input);
        const result = thenable(returned) ? ((await returned) as R | undefined | null) : returned;
        done?.();
        if (result !== undefined && result !== null) return result;
      } catch (error) {
        done?.(error);
        this.raise(error, tap.name);
      }
    }
    return undefined;
  }
}

/**
 * 同步 tap 返回了 thenable —— 这是把 `async` 函数注册到同步 hook 上的典型笔误。
 *
 * @remarks 类型上挡不住:返回类型 `void` 的函数位置接受任何返回值,`async () => {}` 照样通过。
 *   所以只能在运行期点名报错。静默放过等于丢一个没人 await 的 Promise,错误会以 unhandled
 *   rejection 的形式出现在完全无关的地方。
 */
function refuse(hook: string, tap: string): never {
  throw new TypeError(`hook "${hook}" 是同步的,tap "${tap}" 却返回了 Promise`);
}

/**
 * 同步串行副作用。`call()` 直接返回,不裹 Promise —— 每次派发都要跑、且 tap 一定同步的热路径
 * 用它,省掉调用侧的 `await` 与一整条微任务链。
 *
 * 没有同步版的 `ParallelHook`:并发本身就意味着异步。
 */
export class SyncSeriesHook<I> extends Hook<(input: I) => void, I> {
  public call(input: I): void {
    for (const tap of this.plan().order) {
      if (tap.gate && !tap.gate(input)) continue;
      const done = this.probe?.(this.name, tap.name);
      try {
        if (thenable(tap.fn(input))) refuse(this.name, tap.name);
        done?.();
      } catch (error) {
        done?.(error);
        this.raise(error, tap.name);
      }
    }
  }
}

export type SyncProduce<O> = (base: O, recipe: (draft: O) => void | O) => O;

export interface SyncWaterfallOptions<O> extends HookOptions {
  produce?: SyncProduce<O> | undefined;
}

/** 同步链式改写。语义同 {@link WaterfallHook},只是不等待。 */
export class SyncWaterfallHook<I, O> extends Hook<(input: I, output: O) => void | O, I> {
  private readonly produce: SyncProduce<O> | undefined;

  public constructor(name: string, options: SyncWaterfallOptions<O> = {}) {
    super(name, options);
    this.produce = options.produce;
  }

  public call(input: I, output: O): O {
    let current = output;
    for (const tap of this.plan().order) {
      if (tap.gate && !tap.gate(input)) continue;
      const done = this.probe?.(this.name, tap.name);
      try {
        if (this.produce) {
          current = this.produce(current, (draft) => tap.fn(input, draft));
        } else {
          const returned = tap.fn(input, current);
          if (thenable(returned)) refuse(this.name, tap.name);
          if (returned !== undefined) current = returned as O;
        }
        done?.();
      } catch (error) {
        done?.(error);
        this.raise(error, tap.name);
      }
    }
    return current;
  }
}

/** 同步熔断。语义同 {@link BailHook},只是不等待。 */
export class SyncBailHook<I, R> extends Hook<(input: I) => R | undefined | null, I> {
  public call(input: I): R | undefined {
    for (const tap of this.plan().order) {
      if (tap.gate && !tap.gate(input)) continue;
      const done = this.probe?.(this.name, tap.name);
      try {
        const result = tap.fn(input);
        if (thenable(result)) refuse(this.name, tap.name);
        done?.();
        if (result !== undefined && result !== null) return result;
      } catch (error) {
        done?.(error);
        this.raise(error, tap.name);
      }
    }
    return undefined;
  }
}

/**
 * 按 key 动态派生的一组 hook(webpack `HookMap`)。
 *
 * **与 filter 的分工**:`filter` 让一个 hook 的每个 tap 自己判断要不要跑,派发一次要过 n 次
 * 判断;`HookMap` 直接按 key 取到那一组 tap,派发只付一次查表。key 空间稀疏且基数大时
 * (按扩展名 / 命令名 / 事件名分派)用它,几个条件就能分完的用 `filter`。
 *
 * @example
 * ```ts
 * const command = new HookMap((key) => new SyncBailHook<Args, Result>(`command:${key}`));
 * command.for("build").tap({ name: "builder" }, run);
 * command.for("build").call(args);
 * ```
 */
export class HookMap<T extends Hook<any, any>> {
  private readonly hooks = new Map<string, T>();
  private ranking: Ranking | undefined;
  private current: Probe | undefined;

  public constructor(private readonly create: (key: string) => T) {}

  /** 已派生出来的 key 数,不是 tap 数。 */
  public get size(): number {
    return this.hooks.size;
  }

  public keys(): IterableIterator<string> {
    return this.hooks.keys();
  }

  /** 取某个 key 的 hook,没有就建一个 —— 新建的自动继承已注入的权重与探针。 */
  public for(key: string): T {
    const existing = this.hooks.get(key);
    if (existing) return existing;
    const hook = this.create(key);
    if (this.ranking) hook.weigh(this.ranking);
    if (this.current) hook.probe = this.current;
    this.hooks.set(key, hook);
    return hook;
  }

  public get probe(): Probe | undefined {
    return this.current;
  }

  public set probe(probe: Probe | undefined) {
    this.current = probe;
    for (const hook of this.hooks.values()) hook.probe = probe;
  }

  public weigh(ranking: Ranking): void {
    this.ranking = ranking;
    for (const hook of this.hooks.values()) hook.weigh(ranking);
  }

  /** 校验已派生的每个 hook;`use()` 之后才新建的 key 不在其中。 */
  public verify(): void {
    for (const hook of this.hooks.values()) hook.verify();
  }
}
