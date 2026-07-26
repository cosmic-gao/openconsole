import { Incomplete, Interrupted } from "./error";

/**
 * 可分步推进的运算。全部中间状态都在实例上，因此随时可停、可续：
 * 中断只是停止调用 {@link Task.advance}，再调一次就从原处接着跑。
 */
export abstract class Task<T> {
  /** 推进至多 `budget` 个基本步；返回 `false` 表示已跑完。 */
  public abstract advance(budget: number): boolean;

  /** 是否已跑完。 */
  public abstract get settled(): boolean;

  /** 完成度 0..1，粒度取决于算法。 */
  public abstract get progress(): number;

  /**
   * 取结果。
   *
   * @throws {@link Incomplete} 任务尚未跑完——中间态一律不对外，避免把未收敛的值当答案用
   */
  public abstract result(): T;
}

/** 只需实现单步推进的任务骨架，预算记账由基类负责。 */
export abstract class Stepwise<T> extends Task<T> {
  #settled = false;

  public advance(budget: number): boolean {
    for (let i = 0; i < budget && !this.#settled; i++) {
      if (!this.step()) this.#settled = true;
    }
    return !this.#settled;
  }

  public get settled(): boolean {
    return this.#settled;
  }

  /** 供 `result()` 开头调用。@throws {@link Incomplete} 尚未跑完 */
  protected ensure(): void {
    if (!this.#settled) throw new Incomplete(this.progress);
  }

  /** 推进一个基本单位；返回 `false` 表示全部工作已完成。 */
  protected abstract step(): boolean;
}

/** 检查中断的步长：足够大以摊薄检查成本，足够小以保证响应及时。 */
const CHUNK = 4096;

/**
 * 同步跑完。
 *
 * @throws {@link Interrupted} `signal` 已中断；任务现场保留，可再次 settle 续跑
 */
export function settle<T>(task: Task<T>, signal?: AbortSignal): T {
  if (signal === undefined) {
    while (task.advance(Infinity));
    return task.result();
  }
  do {
    if (signal.aborted) throw new Interrupted(task.progress);
  } while (task.advance(CHUNK));
  return task.result();
}

export interface ScheduleOptions {
  /** 每帧推进的步数。 */
  budget?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

/**
 * 分帧推进，帧间让出事件循环，长跑算法不再冻结 UI。
 *
 * @remarks 每帧让出都要经过一轮宏任务，浏览器对嵌套 `setTimeout` 有约 4ms 的下限，
 *   因此 `budget` 定得过小会让让出成本盖过计算本身。
 */
export async function schedule<T>(
  task: Task<T>,
  options: ScheduleOptions = {},
): Promise<T> {
  const { budget = CHUNK, signal, onProgress } = options;
  for (;;) {
    if (signal?.aborted) throw new Interrupted(task.progress);
    const running = task.advance(budget);
    // 报告放在推进之后、跳出之前，最后一帧才会报出 1——否则进度条永远差一口。
    onProgress?.(task.progress);
    if (!running) break;
    await breathe();
  }
  return task.result();
}

const breathe = (): Promise<void> =>
  new Promise((resume) => {
    setTimeout(resume, 0);
  });

class Ready<T> extends Task<T> {
  public constructor(private readonly _value: T) {
    super();
  }

  public advance(): boolean {
    return false;
  }

  public get settled(): boolean {
    return true;
  }

  public get progress(): number {
    return 1;
  }

  public result(): T {
    return this._value;
  }
}

class Sequence<A, B> extends Task<B> {
  private _second: Task<B> | undefined;

  public constructor(
    private readonly _first: Task<A>,
    private readonly _next: (value: A) => Task<B>,
  ) {
    super();
  }

  public advance(budget: number): boolean {
    if (this._second === undefined) {
      if (this._first.advance(budget)) return true;
      this._second = this._next(this._first.result());
    }
    return this._second.advance(budget);
  }

  public get settled(): boolean {
    return this._second?.settled ?? false;
  }

  public get progress(): number {
    return this._second === undefined
      ? this._first.progress / 2
      : (1 + this._second.progress) / 2;
  }

  public result(): B {
    if (this._second === undefined) throw new Incomplete(this.progress);
    return this._second.result();
  }
}

/** 已经算完的任务，供组合使用。 */
export const ready = <T>(value: T): Task<T> => new Ready(value);

/** 串联两个阶段：后一阶段由前一阶段的结果构造，中断点贯穿两段。 */
export const chain = <A, B>(
  first: Task<A>,
  next: (value: A) => Task<B>,
): Task<B> => new Sequence(first, next);

/** 变换任务结果，不改变推进节奏。 */
export const transform = <A, B>(
  task: Task<A>,
  convert: (value: A) => B,
): Task<B> => new Sequence(task, (value) => new Ready(convert(value)));
