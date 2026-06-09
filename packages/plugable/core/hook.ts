/**
 * Hook 引擎:类型化、多策略、可过滤的钩子。
 *
 * 四种派发策略:
 *  - {@link SeriesHook}    串行副作用:逐个 await,单个 tap 出错可隔离;
 *  - {@link ParallelHook}  并行副作用:全部并发;
 *  - {@link WaterfallHook} 链式改写:输出顺着 taps 依次传递;
 *  - {@link BailHook}      熔断:首个返回非空结果的 tap 胜出并短路。
 */

/** 同一 hook 内 tap 的局部次序。 */
export type TapOrder = "pre" | "default" | "post";
const RANK: Record<TapOrder, number> = { pre: 0, default: 1, post: 2 };

/** tap 注册选项。 */
export interface TapOptions<I> {
  /** 来源标识(排序 tiebreak / 调试 / 卸载分组);{@link PluginManager} 自动注入插件名。 */
  name?: string | undefined;
  /** 局部次序;默认 `"default"`。 */
  order?: TapOrder | undefined;
  /** 仅当谓词为真才执行该 tap。 */
  filter?: ((input: I) => boolean) | undefined;
}

interface Tap<F, I> {
  fn: F;
  name: string;
  order: TapOrder;
  filter: ((input: I) => boolean) | undefined;
  seq: number;
}

/**
 * 钩子基类:管理 tap 注册、过滤与排序。派发策略见各子类的 `call()`。
 *
 * @template F tap 回调签名
 * @template I 派发输入类型(filter 的入参)
 */
export abstract class Hook<F extends (...args: any[]) => unknown, I> {
  protected taps: Tap<F, I>[] = [];
  private counter = 0;

  /**
   * 由 {@link PluginManager} 注入:插件名 → 全局顺序权重。
   * 默认恒 0 → 独立使用时排序退化为 order + 注册序。
   */
  public resolveWeight: (name: string) => number = () => 0;

  public constructor(public readonly name: string) {}

  /** 注册一个 tap,返回 un-tap。 */
  public tap(options: TapOptions<I> | string, fn: F): () => void {
    const opts = typeof options === "string" ? { name: options } : options;
    const tap: Tap<F, I> = {
      fn,
      name: opts.name ?? "anonymous",
      order: opts.order ?? "default",
      filter: opts.filter,
      seq: this.counter++,
    };
    this.taps.push(tap);
    return () => {
      const index = this.taps.indexOf(tap);
      if (index >= 0) this.taps.splice(index, 1);
    };
  }

  /** 移除某来源的全部 tap(热重载 / 卸载兜底)。 */
  public removeByName(name: string): void {
    this.taps = this.taps.filter((tap) => tap.name !== name);
  }

  /** 当前 tap 数。 */
  public get size(): number {
    return this.taps.length;
  }

  /** 过滤命中 + 排序:① 局部 order ② 顺序权重 ③ 注册序。 */
  protected select(input: I): Tap<F, I>[] {
    return this.taps
      .filter((tap) => !tap.filter || tap.filter(input))
      .sort(
        (a, b) =>
          RANK[a.order] - RANK[b.order] ||
          this.resolveWeight(a.name) - this.resolveWeight(b.name) ||
          a.seq - b.seq,
      );
  }
}

/** 串行副作用:逐个 await;单个 tap 抛错交 `onError` 处理(缺省吞掉),不阻断其余。 */
export class SeriesHook<I> extends Hook<(input: I) => void | Promise<void>, I> {
  public constructor(
    name: string,
    private readonly onError?: (error: unknown, tap: string) => void,
  ) {
    super(name);
  }

  public async call(input: I): Promise<void> {
    for (const tap of this.select(input)) {
      try {
        await tap.fn(input);
      } catch (error) {
        if (this.onError) this.onError(error, tap.name);
        else throw error;
      }
    }
  }
}

/** 并行副作用:全部并发,`allSettled` 等待完成(互不阻断)。 */
export class ParallelHook<I> extends Hook<(input: I) => void | Promise<void>, I> {
  public async call(input: I): Promise<void> {
    await Promise.allSettled(this.select(input).map((tap) => tap.fn(input)));
  }
}

/**
 * 注入式 produce(immer 兼容签名):提供则走不可变快照,省略则原地改写。
 *
 * @example
 * ```ts
 * import { produce } from "immer";
 * new WaterfallHook("transform", produce);
 * ```
 */
export type Produce<O> = (base: O, recipe: (draft: O) => void | O | Promise<void | O>) => O | Promise<O>;

/**
 * 链式改写:`output` 顺着 taps 依次传递,每个 tap 改 `output` 或 `return` 新值替换(二选一,勿同时)。
 * 注入 {@link Produce} 走不可变快照,否则原地改写。
 *
 * @template I 只读输入(filter / 上下文)
 * @template O 被改写的输出
 */
export class WaterfallHook<I, O> extends Hook<(input: I, output: O) => void | O | Promise<void | O>, I> {
  public constructor(
    name: string,
    private readonly produce?: Produce<O>,
  ) {
    super(name);
  }

  public async call(input: I, output: O): Promise<O> {
    let current = output;
    for (const tap of this.select(input)) {
      if (this.produce) {
        current = await this.produce(current, (draft) => tap.fn(input, draft));
      } else {
        const replaced = await tap.fn(input, current);
        if (replaced !== undefined) current = replaced as O;
      }
    }
    return current;
  }
}

/** 熔断:首个返回非空(非 `undefined` / `null`)的 tap 胜出并短路;其余不执行。 */
export class BailHook<I, R> extends Hook<(input: I) => R | undefined | null | Promise<R | undefined | null>, I> {
  public async call(input: I): Promise<R | undefined> {
    for (const tap of this.select(input)) {
      const result = await tap.fn(input);
      if (result !== undefined && result !== null) return result;
    }
    return undefined;
  }
}
