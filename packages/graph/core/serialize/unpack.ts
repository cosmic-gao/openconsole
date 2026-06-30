import { Graph, Schema } from "../classic";
import type { Node, NodeId, PortId } from "../types";
import { VERSION, type Compact } from "./compact";
import { buildNode, linkEdge } from "./internal";
import { mergeLookup, type SocketLookup } from "./sockets";

/** 将紧凑格式还原为图，恢复端口约束与层次关系；版本不匹配时抛出 Schema 错误。 */
export function unpack<N, E>(
  data: Compact,
  options?: { target?: Graph<N, E>; sockets?: SocketLookup },
): Graph<N, E> {
  if (data.v !== VERSION) throw new Schema(data.v, VERSION);

  const graph = options?.target ?? new Graph<N, E>(data.g);
  if (options?.target) graph.clear();

  const sockets = mergeLookup(options?.sockets);

  return graph.batch(() => {
    const nodeMap = new Map<NodeId, Node<unknown>>();
    for (const compact of data.n) {
      const node = buildNode(
        compact,
        sockets,
        (id) => id as NodeId,
        (id) => id as PortId,
      );
      nodeMap.set(node.id, node);
      graph.addNode(node as Node<N>);
    }
    for (const [id, sNode, sPort, tNode, tPort, weight] of data.e) {
      graph.addEdge(
        linkEdge(
          (n) => nodeMap.get(n),
          id,
          sNode,
          sPort,
          tNode,
          tPort,
          weight as E,
        ),
      );
    }
    if (data.h) {
      for (const [child, parent] of data.h) graph.setParent(child, parent);
    }
    return graph;
  });
}
