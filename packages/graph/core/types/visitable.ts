/**
 * Visitable 能力：维护已访问位图。
 */

import type { NodeId } from './brand';

/**
 * 维护已访问集合的能力 trait — 用于自定义图实现复用底层位图存储。
 *
 * @remarks
 * - **内置算法（DFS / BFS / SCC / Dijkstra / topology 等）目前都用 `new Set<NodeId>()`
 *   自己维护 visited，不依赖此 trait** — 它是给以下场景预留的扩展点：
 *   1. 用户自定义图实现想复用图实例上已分配的位图（如稠密布尔数组）；
 *   2. 第三方算法包装器需要预制 / 清空 visited 状态而不分配新 Map。
 * - {@link Graph} 实现该 trait 以保证适配器（{@link Reversed}）能透传；
 * - 若未来内置算法迁移到 visit-via-trait 形式（如 Boost.Graph 风格的 colormap 模型），
 *   此 trait 即就位。
 */
export interface Visitable {
  /** 创建一张全部初始化为 `false` 的访问位图。 */
  marks(): Map<NodeId, boolean>;
  /** 把传入的访问位图全部重置为 `false`（原地修改）。 */
  reset(map: Map<NodeId, boolean>): void;
}
