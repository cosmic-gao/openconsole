import type { Direction, EdgeId, PortId } from "../types";
import type { Socket } from "./socket";

interface Constraints {
  multiple?: boolean | undefined;
  required?: boolean | undefined;
  fallback?: unknown;
}

/**
 * 端口抽象基类：自持所连边的列表，并携带 multiple/required/fallback 约束。
 *
 * @typeParam S - 端口的数据类型
 */
export abstract class Port<S extends Socket = Socket> {
  /** 端口方向（输入或输出），由子类固定。 */
  public abstract readonly direction: Direction;

  /** 当前连接到本端口的边 id 列表。 */
  public readonly edges: EdgeId[] = [];

  /** 是否允许连接多条边。 */
  public multiple: boolean;
  /** 是否为必连端口。 */
  public required: boolean;
  /** 未连接时使用的回退值。 */
  public fallback: unknown;

  private readonly _index = new Map<EdgeId, number>();

  protected constructor(
    /** 端口的数据类型。 */
    public readonly socket: S,
    /** 端口唯一 id。 */
    public readonly id: PortId,
    constraints?: Constraints,
  ) {
    this.multiple = constraints?.multiple ?? true;
    this.required = constraints?.required ?? false;
    this.fallback = constraints?.fallback;
  }

  /** 是否已连接至少一条边。 */
  public get connected(): boolean {
    return this.edges.length > 0;
  }

  /**
   * 连接一条边到本端口。
   *
   * @returns 新连接返回 `true`，已存在则返回 `false`
   */
  public attach(edge: EdgeId): boolean {
    if (this._index.has(edge)) return false;
    this._index.set(edge, this.edges.length);
    this.edges.push(edge);
    return true;
  }

  /**
   * 断开一条边。
   *
   * @returns 成功断开返回 `true`，边不存在则返回 `false`
   */
  public detach(edge: EdgeId): boolean {
    const index = this._index.get(edge);
    if (index === undefined) return false;
    const lastIndex = this.edges.length - 1;
    if (index !== lastIndex) {
      const last = this.edges[lastIndex]!;
      this.edges[index] = last;
      this._index.set(last, index);
    }
    this.edges.pop();
    this._index.delete(edge);
    return true;
  }

  /** 断开本端口上的所有边。 */
  public clear(): void {
    this.edges.length = 0;
    this._index.clear();
  }
}

/**
 * 输入端口。
 *
 * @typeParam S - 端口的数据类型
 */
export class Input<S extends Socket = Socket> extends Port<S> {
  /** 端口方向，固定为 `'input'`。 */
  public readonly direction = "input" as const;

  public constructor(socket: S, id: PortId, constraints?: Constraints) {
    super(socket, id, constraints);
  }
}

/**
 * 输出端口。
 *
 * @typeParam S - 端口的数据类型
 */
export class Output<S extends Socket = Socket> extends Port<S> {
  /** 端口方向，固定为 `'output'`。 */
  public readonly direction = "output" as const;

  public constructor(socket: S, id: PortId, constraints?: Constraints) {
    super(socket, id, constraints);
  }
}
