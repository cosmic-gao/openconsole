import type { NodeId, PortId } from "../types";
import type { Port } from "./port";
import type { Vertex } from "./vertex";

/**
 * 端点：一个节点与其上某个端口的组合，用于定位边的连接位置。
 */
export class Endpoint<N extends Vertex = Vertex, P extends Port = Port> {
  public constructor(
    /** 端点所属节点。 */
    public readonly node: N,
    /** 端点对应端口。 */
    public readonly port: P,
  ) {}

  /** 所属节点的 id。 */
  public get nodeId(): NodeId {
    return this.node.id;
  }

  /** 对应端口的 id。 */
  public get portId(): PortId {
    return this.port.id;
  }
}
