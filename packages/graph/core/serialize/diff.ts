import { Graph } from "../model";
import { dumpEdge, dumpNode } from "../support";
import type { NodeId } from "../types";
import { loadEdge, loadNode, samePorts, sameWeight } from "./codec";
import type { GraphOp, GraphPatch } from "./ops";
import { mergeLookup, type SocketLookup } from "./sockets";

/** diff 选项，可自定义权重相等比较函数 equals。 */
export interface DiffOptions {
  equals?: <T>(a: T | undefined, b: T | undefined) => boolean;
}

/** 计算两图之间的结构化差异补丁，检测节点/边/权重/端口结构/层次的变更。 */
export function diff<N, E>(
  before: Graph<N, E>,
  after: Graph<N, E>,
  options?: DiffOptions,
): GraphPatch<N, E> {
  const equals = options?.equals ?? sameWeight;
  const ops: GraphOp<N, E>[] = [];

  const changed = new Set<NodeId>();
  for (const id of after.nodes()) {
    const old = before.node(id);
    if (old && !samePorts(old, after.node(id)!)) changed.add(id);
  }

  const dropped = new Set<NodeId>();
  for (const id of before.nodes()) {
    if (!after.hasNode(id) || changed.has(id)) dropped.add(id);
  }

  for (const edgeId of before.edges()) {
    const edge = before.edge(edgeId)!;
    if (
      !after.hasEdge(edgeId) ||
      changed.has(edge.sourceId) ||
      changed.has(edge.targetId)
    ) {
      ops.push({ kind: "dropEdge", data: dumpEdge(edge) });
    }
  }

  for (const id of dropped) {
    ops.push({ kind: "dropNode", data: dumpNode(before.node(id)!) });
  }

  for (const id of after.nodes()) {
    const old = before.node(id);
    const next = after.node(id)!;
    if (!old || changed.has(id)) {
      ops.push({ kind: "addNode", data: dumpNode(next) });
    } else if (!equals(old.weight, next.weight)) {
      ops.push({
        kind: "setNodeWeight",
        id,
        from: old.weight,
        to: next.weight,
      });
    }
  }

  for (const edgeId of after.edges()) {
    const edge = after.edge(edgeId)!;
    const old = before.edge(edgeId);
    if (!old || changed.has(edge.sourceId) || changed.has(edge.targetId)) {
      ops.push({ kind: "addEdge", data: dumpEdge(edge) });
    } else if (!equals(old.weight, edge.weight)) {
      ops.push({
        kind: "setEdgeWeight",
        id: edgeId,
        from: old.weight,
        to: edge.weight,
      });
    }
  }

  for (const id of after.nodes()) {
    const to = after.parent(id);
    const from =
      before.hasNode(id) && !changed.has(id) ? before.parent(id) : undefined;
    if (to === undefined) {
      if (from !== undefined)
        ops.push({ kind: "setParent", node: id, from, to: undefined });
    } else if (from !== to || dropped.has(id) || dropped.has(to)) {
      ops.push({ kind: "setParent", node: id, from, to });
    }
  }

  return { ops };
}

/** 将差异补丁按顺序应用到图上。 */
export function apply<N, E>(
  graph: Graph<N, E>,
  patch: GraphPatch<N, E>,
  options?: { sockets?: SocketLookup },
): void {
  const sockets = mergeLookup(options?.sockets);
  for (const op of patch.ops) {
    switch (op.kind) {
      case "dropEdge":
        graph.dropEdge(op.data.id);
        break;
      case "dropNode":
        graph.dropNode(op.data.id);
        break;
      case "addNode":
        graph.addNode(loadNode(op.data, sockets));
        break;
      case "addEdge":
        graph.addEdge(loadEdge(graph, op.data));
        break;
      case "setNodeWeight":
        if (graph.hasNode(op.id)) graph.setNodeWeight(op.id, op.to);
        break;
      case "setEdgeWeight":
        if (graph.hasEdge(op.id)) graph.setEdgeWeight(op.id, op.to);
        break;
      case "setParent":
        if (op.to === undefined) {
          if (graph.hasNode(op.node)) graph.unparent(op.node);
        } else if (graph.hasNode(op.node) && graph.hasNode(op.to)) {
          graph.setParent(op.node, op.to);
        }
        break;
    }
  }
}

/** 反转补丁，得到可撤销原补丁的逆向补丁。 */
export function invert<N, E>(patch: GraphPatch<N, E>): GraphPatch<N, E> {
  const inverted: GraphOp<N, E>[] = [];
  for (let i = patch.ops.length - 1; i >= 0; i--) {
    const op = patch.ops[i]!;
    switch (op.kind) {
      case "addNode":
        inverted.push({ kind: "dropNode", data: op.data });
        break;
      case "dropNode":
        inverted.push({ kind: "addNode", data: op.data });
        break;
      case "addEdge":
        inverted.push({ kind: "dropEdge", data: op.data });
        break;
      case "dropEdge":
        inverted.push({ kind: "addEdge", data: op.data });
        break;
      case "setNodeWeight":
        inverted.push({
          kind: "setNodeWeight",
          id: op.id,
          from: op.to,
          to: op.from,
        });
        break;
      case "setEdgeWeight":
        inverted.push({
          kind: "setEdgeWeight",
          id: op.id,
          from: op.to,
          to: op.from,
        });
        break;
      case "setParent":
        inverted.push({
          kind: "setParent",
          node: op.node,
          from: op.to,
          to: op.from,
        });
        break;
    }
  }
  return { ops: inverted };
}
