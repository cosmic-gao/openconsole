/**
 * Visitable 能力：维护已访问位图。
 */

import type { NodeId } from './brand';

/** 能维护已访问集合 - 用于遍历算法。 */
export interface Visitable {
  /** 创建一张全部初始化为 `false` 的访问位图。 */
  marks(): Map<NodeId, boolean>;
  /** 把传入的访问位图全部重置为 `false`（原地修改）。 */
  reset(map: Map<NodeId, boolean>): void;
}
