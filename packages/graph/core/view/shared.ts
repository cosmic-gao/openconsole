import type { Catalog, EdgeView, NodeId } from "../types";

/** 翻转边视图的两端，用于反向 / 无向视图。 */
export function flip<E>(view: EdgeView<E>): EdgeView<E> {
  return {
    id: view.id,
    source: view.target,
    target: view.source,
    weight: view.weight,
  };
}

/** 内层图不具备 {@link NodeIndexable} 时的下标兜底：按枚举顺序线性定位。 */
export function nodeAt(inner: Catalog, index: number): NodeId | undefined {
  let i = 0;
  for (const id of inner.nodes()) {
    if (i === index) return id;
    i++;
  }
  return undefined;
}

/** 内层图不具备 {@link NodeIndexable} 时的下标兜底：按枚举顺序线性查找。 */
export function nodeIndex(inner: Catalog, node: NodeId): number {
  let i = 0;
  for (const id of inner.nodes()) {
    if (id === node) return i;
    i++;
  }
  return -1;
}
