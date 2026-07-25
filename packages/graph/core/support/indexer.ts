import type { Catalog, NodeId } from "../types";

/** 节点枚举结果：按首次出现顺序的标签表，以及标签到下标的逆映射。 */
export interface Indexed {
  /** 按下标排列的节点 id。 */
  readonly labels: NodeId[];
  /** 节点 id 到下标的映射。 */
  readonly index: Map<NodeId, number>;
}

/**
 * 为图的节点分配稠密整数下标，供矩阵 / typed-array 类算法把 `NodeId` 折算成数组位置。
 *
 * 按 `nodes()` 的首次出现顺序编号并去重——视图可能重复产出同一节点，
 * 若不去重会让 labels 与 index 错位。
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
