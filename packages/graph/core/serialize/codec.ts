import {
  Edge,
  Endpoint,
  Graph,
  Socket,
  Vertex,
  type Input,
  type Output,
} from "../model";
import { lookupPort, type PortTuple } from "../support";
import type {
  Direction,
  EdgeId,
  JsonEdge,
  JsonNode,
  JsonPort,
  Node,
  NodeId,
  PortId,
  PortOptions,
  Ports,
} from "../types";
import type { CompactNode } from "./format";

/**
 * 按方向装一个端口，并把 socket 名解析成实例（未登记的名字退化为通配）。
 * 紧凑格式与 JSON 格式的四条安装分支都收口到这里。
 */
function attach(
  node: Node<unknown>,
  direction: Direction,
  name: string,
  socket: string,
  sockets: ReadonlyMap<string, Socket>,
  options: PortOptions,
): void {
  const resolved = sockets.get(socket) ?? Socket.any;
  if (direction === "input") node.addInput(name, resolved, options);
  else node.addOutput(name, resolved, options);
}

/** `map` 结构上兼容 kernel 的 Mapping，此处只用到节点与端口两个方向。 */
export function buildNode(
  compact: CompactNode,
  sockets: ReadonlyMap<string, Socket>,
  map: { node(id: NodeId): NodeId; port(id: PortId): PortId },
): Node<unknown> {
  const [id, weight, inputs, outputs] = compact;
  const node = new Vertex(map.node(id), weight) as Node<unknown>;

  const install = (
    direction: Direction,
    tuples: ReadonlyArray<PortTuple> | null,
  ): void => {
    if (!tuples) return;
    for (const [name, portId, socketName, c] of tuples) {
      attach(node, direction, name, socketName, sockets, {
        id: map.port(portId),
        multiple: c?.m,
        required: c?.r,
        fallback: c?.f,
      });
    }
  };

  install("input", inputs);
  install("output", outputs);
  return node;
}

export function loadNode<N>(
  data: JsonNode<N>,
  sockets: ReadonlyMap<string, Socket>,
): Node<N> {
  const node = new Vertex(data.id, data.weight) as Node<N>;

  const install = (
    direction: Direction,
    ports: Record<string, JsonPort | null>,
  ): void => {
    for (const name in ports) {
      const port = ports[name];
      if (!port) continue;
      attach(node as Node<unknown>, direction, name, port.socket, sockets, {
        id: port.id,
        multiple: port.multiple,
        required: port.required,
        fallback: port.fallback,
      });
    }
  };

  install("input", data.inputs);
  install("output", data.outputs);
  return node;
}

export function linkEdge<E>(
  lookup: (id: NodeId) => Node<unknown> | undefined,
  edgeId: EdgeId,
  sourceNodeId: NodeId,
  sourcePortId: PortId,
  targetNodeId: NodeId,
  targetPortId: PortId,
  weight: E | undefined,
): Edge<E> {
  const sourceNode = lookup(sourceNodeId);
  const targetNode = lookup(targetNodeId);
  if (!sourceNode || !targetNode) {
    throw new Error(
      `edge "${String(edgeId)}" references missing nodes: ${String(sourceNodeId)} -> ${String(targetNodeId)}`,
    );
  }
  const sourcePort = lookupPort<Output>(sourceNode.outputs, sourcePortId);
  const targetPort = lookupPort<Input>(targetNode.inputs, targetPortId);
  if (!sourcePort || !targetPort) {
    throw new Error(`edge "${String(edgeId)}" references missing ports`);
  }
  return new Edge<E>(
    edgeId,
    new Endpoint(sourceNode, sourcePort),
    new Endpoint(targetNode, targetPort),
    weight,
  );
}

export function loadEdge<N, E>(graph: Graph<N, E>, data: JsonEdge<E>): Edge<E> {
  return linkEdge(
    (id) => graph.node(id),
    data.id,
    data.source.nodeId,
    data.source.portId,
    data.target.nodeId,
    data.target.portId,
    data.weight,
  );
}

export function sameWeight<T>(a: T | undefined, b: T | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== "object" && typeof b !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function samePorts(a: Node<unknown>, b: Node<unknown>): boolean {
  return (
    signature(a.inputs) === signature(b.inputs) &&
    signature(a.outputs) === signature(b.outputs)
  );
}

function signature(ports: Ports): string {
  const parts: string[] = [];
  for (const name in ports) {
    const port = ports[name];
    if (port) {
      parts.push(
        `${name} ${String(port.id)} ${port.socket.name} ${port.multiple} ${port.required}`,
      );
    }
  }
  return parts.sort().join("");
}
