import type { Direction, EdgeId, NodeId } from "../types";
import type { Endpoint } from "./endpoint";

/**
 * 有向边：从源端点指向目标端点，并携带可选权重。
 */
export class Edge<W = unknown> {
  /** 边权重（可选）。 */
  public weight: W | undefined;

  public constructor(
    /** 边唯一 id。 */
    public readonly id: EdgeId,
    /** 源端点（输出侧）。 */
    public readonly source: Endpoint,
    /** 目标端点（输入侧）。 */
    public readonly target: Endpoint,
    weight?: W,
  ) {
    this.weight = weight;
  }

  /** 源节点 id。 */
  public get sourceId(): NodeId {
    return this.source.nodeId;
  }

  /** 目标节点 id。 */
  public get targetId(): NodeId {
    return this.target.nodeId;
  }

  /** 判断本边是否连接到指定节点（作为源或目标）。 */
  public connects(node: NodeId): boolean {
    return this.source.nodeId === node || this.target.nodeId === node;
  }

  /** 按方向返回对端节点：`'input'` 返回源节点，否则返回目标节点。 */
  public opposite(direction: Direction): NodeId {
    return direction === "input" ? this.source.nodeId : this.target.nodeId;
  }
}
