import type { EdgeId, NodeId } from "./ident";
import type { Ports } from "./vertex";

/**
 * 图的变更事件。载荷是值快照而非活对象，因此在事务中缓冲、稍后派发也不会读到已失效的状态。
 */
export interface Events<N = unknown, E = unknown> {
  nodeAdded: { node: NodeId };
  nodeDropped: { node: NodeId; weight: N | undefined };
  nodeUpdated: { node: NodeId; before: N | undefined; after: N | undefined };
  nodeReshaped: { node: NodeId; inputs: Ports; outputs: Ports };
  edgeAdded: { edge: EdgeId; source: NodeId; target: NodeId };
  edgeDropped: {
    edge: EdgeId;
    source: NodeId;
    target: NodeId;
    weight: E | undefined;
  };
  edgeUpdated: { edge: EdgeId; before: E | undefined; after: E | undefined };
  parentChanged: {
    node: NodeId;
    before: NodeId | undefined;
    after: NodeId | undefined;
  };
}
