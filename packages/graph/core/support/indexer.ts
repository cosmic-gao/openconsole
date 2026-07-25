import type { Catalog, NodeId } from "../types";

/** 节点枚举结果：按首次出现顺序的标签表，以及标签到下标的逆映射。 */
export interface Indexed {
  readonly labels: NodeId[];
  readonly index: Map<NodeId, number>;
}

/**
 * 为节点分配稠密整数下标，供矩阵 / typed-array 类算法使用。
 *
 * @remarks 按首次出现顺序编号并**去重**——视图可能重复产出同一节点，不去重会让
 *   labels 与 index 错位。
 */
export function enumerate(graph: Catalog): Indexed {
  const labels: NodeId[] = [];
  const index = new Map<NodeId, number>();
  for (const id of graph.nodes()) {
    if (!index.has(id)) {
      index.set(id, labels.length);
      labels.push(id);
    }
  }
  return { labels, index };
}
