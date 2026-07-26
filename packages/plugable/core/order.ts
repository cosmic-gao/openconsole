/**
 * 插件顺序:把 `enforce` / `before` / `after` 投影成一条 {@link Pipeline}。本层只做三件事 ——
 * `enforce` → 桶号、桶号 → `"pre 相"` 之类的可读名、位次包成带 `code` 的 {@link OrderCode}。
 */

import { Pipeline, type Placement, type Plan, type Step } from "./pipeline";

/** 硬分相:`pre` 整体先于默认,默认整体先于 `post`。 */
export type Enforce = "pre" | "post";

/** 插件的先后声明 —— {@link Plugin} 结构上就满足它。 */
export interface Ordered {
  readonly name: string;
  /** 须先于这些插件。引用未注册的名字则忽略。 */
  readonly before?: readonly string[] | undefined;
  /** 须后于这些插件。引用未注册的名字则忽略。 */
  readonly after?: readonly string[] | undefined;
  readonly enforce?: Enforce | undefined;
}

export interface OrderCode extends Placement {
  /** `pre` = 0 / 默认 = 1 / `post` = 2。 */
  readonly bucket: 0 | 1 | 2;
  /** 可读可比较的顺序码,如 `"1.002"`。 */
  readonly code: string;
}

const PHASE = ["pre", "default", "post"] as const;

const bucket = (enforce: Enforce | undefined): 0 | 1 | 2 =>
  enforce === "pre" ? 0 : enforce === "post" ? 2 : 1;

const pad = (value: number): string => String(value).padStart(3, "0");

/** 计划的名字投影。 */
interface View {
  readonly plan: Plan<Step>;
  readonly order: readonly string[];
  readonly layers: ReadonlyArray<readonly string[]>;
  readonly codes: ReadonlyMap<string, OrderCode>;
}

export class Ordering {
  private readonly pipeline: Pipeline<Step>;
  private cached: View | undefined;

  public constructor(id = "plugins") {
    this.pipeline = new Pipeline<Step>(id, {
      subject: "插件依赖",
      label: (at) => `${PHASE[at] ?? at} 相`,
    });
  }

  /** 底层图,可直接读来自省。 */
  public get graph(): Pipeline<Step>["graph"] {
    return this.pipeline.graph;
  }

  public batch<T>(work: () => T): T {
    return this.pipeline.batch(work);
  }

  public add(node: Ordered): void {
    this.pipeline.add({
      key: node.name,
      name: node.name,
      bucket: bucket(node.enforce),
      before: node.before,
      after: node.after,
    });
  }

  public remove(name: string): boolean {
    return this.pipeline.remove(name);
  }

  public has(name: string): boolean {
    return this.pipeline.has(name);
  }

  /** 顺序版本号,喂给 {@link Hook} 判断派发计划是否要重排。 */
  public get epoch(): number {
    return this.graph.revision;
  }

  /** 全局线性序号;未知的插件排到最后。 */
  public weight(name: string): number {
    return this.view().codes.get(name)?.sequence ?? Number.MAX_SAFE_INTEGER;
  }

  public sorted(): readonly string[] {
    return this.view().order;
  }

  /** 可并行分组:组内互不依赖,组间有序。 */
  public layers(): ReadonlyArray<readonly string[]> {
    return this.view().layers;
  }

  public codes(): ReadonlyMap<string, OrderCode> {
    return this.view().codes;
  }

  /**
   * @throws {@link CycleError} 依赖成环
   * @throws {@link PhaseError} 依赖方向与分相矛盾
   */
  public verify(): void {
    this.pipeline.verify();
  }

  /** 计划本身已按版本号缓存,故比对它的身份就够了。 */
  private view(): View {
    const plan = this.pipeline.plan();
    if (this.cached?.plan === plan) return this.cached;

    const codes = new Map<string, OrderCode>();
    for (const [name, at] of plan.at) {
      codes.set(name, {
        ...at,
        bucket: at.bucket as 0 | 1 | 2,
        code: `${at.bucket}.${pad(at.sequence)}`,
      });
    }
    this.cached = {
      plan,
      order: plan.order.map((step) => step.name),
      layers: plan.layers.map((group) => group.map((step) => step.name)),
      codes,
    };
    return this.cached;
  }
}
