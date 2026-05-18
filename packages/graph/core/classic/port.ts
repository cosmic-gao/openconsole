/**
 * Port 抽象基类：方向无关的端口基类，承载邻接表与 attach/detach 语义。
 */

import type { Direction, EdgeId, PortId } from '../types';
import type { Socket } from './socket';

/**
 * 端口抽象基类。子类决定方向（{@link Input} / {@link Output}）。
 *
 * @remarks
 * 借鉴 petgraph 的 "数据结构本身即邻接表" 思想：
 * - 每个端口直接持有 `edges` 列表，记录所有从 / 到该端口的边 ID；
 * - {@link Graph} 不再维护任何中央邻接缓存，所有邻接查询从端口列表直接派生；
 * - 这样既消除了缓存失效问题，又把数据 / 索引绑在同一个对象上，便于 GC 回收。
 *
 * @template S 关联的 Socket 类型
 */
export abstract class Port<S extends Socket = Socket> {
  /** 端口方向：`'input'` 或 `'output'`。 */
  public abstract readonly direction: Direction;

  /**
   * 已连接到本端口的边 ID 列表。
   *
   * @remarks
   * - 输入端口：流入本端口的边（fan-in）；
   * - 输出端口：从本端口流出的边（fan-out）；
   * - 顺序保持插入顺序，遍历时无需额外排序。
   */
  public readonly edges: EdgeId[] = [];

  /**
   * @param socket 端口承载的 Socket
   * @param id 端口唯一标识
   */
  protected constructor(
    public readonly socket: S,
    public readonly id: PortId,
  ) {}

  /** 当前是否至少连接了一条边。 */
  public get connected(): boolean {
    return this.edges.length > 0;
  }

  /**
   * 关联一条边到本端口。
   *
   * @remarks
   * 调用约定：`Graph.addEdge` 在 attach 前已经通过 `edges.has(edge.id)` 拒绝重复 ID，
   * 因此本方法不再做 `includes` 去重检查（O(deg) → O(1)）。直接对外调用 `attach` 时
   * 调用方自行保证不重复。
   *
   * @param edge 要关联的边 ID
   */
  public attach(edge: EdgeId): void {
    this.edges.push(edge);
  }

  /**
   * 解除一条边与本端口的关联。
   *
   * @param edge 要解除的边 ID
   * @returns 是否成功解除（边原本存在则返回 `true`）
   */
  public detach(edge: EdgeId): boolean {
    const index = this.edges.indexOf(edge);
    if (index === -1) return false;
    this.edges.splice(index, 1);
    return true;
  }
}
