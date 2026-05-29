/**
 * Port 抽象基类：方向无关的端口基类，承载邻接表与 attach/detach 语义。
 */

import type { Direction, EdgeId, PortId } from '../types';
import type { Socket } from './socket';

/**
 * 端口抽象基类。子类决定方向（{@link Input} / {@link Output}）。
 *
 * @remarks
 * "数据结构本身即邻接表"：
 * - 每个端口直接持有 `edges` 列表，记录所有从 / 到该端口的边 ID；
 * - {@link Graph} 不再维护任何中央邻接缓存，所有邻接查询从端口列表直接派生；
 * - 这样既消除了缓存失效问题，又把数据 / 索引绑在同一个对象上，便于 GC 回收。
 *
 * 性能注记：内部用 `_index: Map<EdgeId, number>` 跟踪每条边在 `edges` 数组中的位置，
 * 配合 swap-and-pop 让 {@link attach} / {@link detach} 都是 O(1)。代价是 `detach`
 * 不再保留插入顺序（被删除位置由原末尾元素填补）。
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
   * - 顺序由 attach 顺序决定；detach 用 swap-and-pop，可能打乱中间元素位置。
   */
  public readonly edges: EdgeId[] = [];

  /** edgeId → 在 {@link edges} 中的下标。 */
  private readonly _index = new Map<EdgeId, number>();

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
   * 关联一条边到本端口（O(1)，幂等）。
   *
   * @remarks
   * 同 ID 边重复 attach 不会破坏内部一致性 — 第二次起返回 `false`，不再追加。
   * `Graph.addEdge` 路径下重复 ID 已先一步在 `edges.has` 处被拒绝，这里只是
   * 防御直接调用 `port.attach` 的代码。
   *
   * @param edge 要关联的边 ID
   * @returns 是否新增（首次 attach 返回 `true`，已存在则返回 `false`）
   */
  public attach(edge: EdgeId): boolean {
    if (this._index.has(edge)) return false;
    this._index.set(edge, this.edges.length);
    this.edges.push(edge);
    return true;
  }

  /**
   * 解除一条边与本端口的关联（O(1) swap-and-pop）。
   *
   * @remarks
   * **swap-and-pop 操作演示**（假设 edges = [e0, e1, e2, e3, e4]，删除 e2）：
   *
   * 1. 找 index = 2（e2 的下标）
   * 2. 末尾元素 e4 搬到 index=2：edges = [e0, e1, e4, e3, e4]
   * 3. 更新 e4 的 _index 为 2
   * 4. pop 末尾：edges = [e0, e1, e4, e3]
   * 5. 从 _index 删除 e2
   *
   * 代价：插入顺序被打乱（e4 跳到了 e2 的位置）。调用方不应依赖 edges 的顺序稳定性。
   * 收益：O(1) 删除，避免 Array#splice 的 O(n) 元素搬移。
   *
   * @param edge 要解除的边 ID
   * @returns 是否成功解除（边原本存在则返回 `true`）
   */
  public detach(edge: EdgeId): boolean {
    const index = this._index.get(edge);
    if (index === undefined) return false;
    const lastIndex = this.edges.length - 1;
    if (index !== lastIndex) {
      // 把末尾元素搬到被删位置；末尾本身待会儿 pop 即可
      const last = this.edges[lastIndex]!;
      this.edges[index] = last;
      this._index.set(last, index);
    }
    this.edges.pop();
    this._index.delete(edge);
    return true;
  }
}
