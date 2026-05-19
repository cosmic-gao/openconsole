/**
 * Walkable 组合：算法常用的最小约束。
 */

import type { Catalog } from './catalog';
import type { Neighbors } from './neighbors';

/** 算法常用的最小约束：可枚举节点 + 列举出邻居。 */
export type Walkable = Catalog & Neighbors;
