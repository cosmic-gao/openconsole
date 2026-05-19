/**
 * weighted：把任意 EdgeView 映射为带默认权重的 EdgeView。
 */

import type { EdgeView } from '../types';

/**
 * 把任意边引用映射为带默认权重的 {@link EdgeView}（`undefined` 处填 `defaultWeight`）。
 *
 * @template E 边的原始权重类型
 * @template W 默认权重类型
 * @param edge 原始边引用（来自 {@link Graph.getEdges} 等）
 * @param defaultWeight `edge.weight` 为 `undefined` 时使用的默认值
 */
export function weighted<E, W>(edge: EdgeView<E>, defaultWeight: W): EdgeView<E | W> {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    weight: edge.weight ?? defaultWeight,
  };
}
