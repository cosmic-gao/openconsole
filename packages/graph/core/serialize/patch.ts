import type { EdgeRecord, Graph } from "../graph";
import type { EdgeId, NodeId } from "../ident";
import type { Port, Ports } from "../vertex";
import {
  resolve,
  restore,
  tuples,
  type PortTuple,
  type SocketLookup,
} from "./format";

/** 节点的可序列化快照，足以原样重建。 */
export interface NodeShape<N = unknown> {
  readonly id: NodeId;
  readonly weight: N | undefined;
  readonly inputs: ReadonlyArray<PortTuple> | null;
  readonly outputs: ReadonlyArray<PortTuple> | null;
}

export interface EdgeShape<E = unknown> {
  readonly id: EdgeId;
  readonly source: NodeId;
  readonly sourcePort: string;
  readonly target: NodeId;
  readonly targetPort: string;
  readonly weight: E | undefined;
}

export type Change<N = unknown, E = unknown> =
  | { readonly kind: "addNode"; readonly node: NodeShape<N> }
  | { readonly kind: "dropNode"; readonly node: NodeShape<N> }
  | { readonly kind: "addEdge"; readonly edge: EdgeShape<E> }
  | { readonly kind: "dropEdge"; readonly edge: EdgeShape<E> }
  | {
      readonly kind: "weighNode";
      readonly node: NodeId;
      readonly from: N | undefined;
      readonly to: N | undefined;
    }
  | {
      readonly kind: "weighEdge";
      readonly edge: EdgeId;
      readonly from: E | undefined;
      readonly to: E | undefined;
    }
  | {
      readonly kind: "reparent";
      readonly node: NodeId;
      readonly from: NodeId | undefined;
      readonly to: NodeId | undefined;
    };

export interface DiffOptions {
  /** 权重相等判定，默认结构化比较。 */
  equal?: (a: unknown, b: unknown) => boolean;
}

const structural = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
};

function shapeNode<N, E>(graph: Graph<N, E>, id: NodeId): NodeShape<N> {
  const record = graph.node(id)!;
  return {
    id,
    weight: record.weight,
    inputs: tuples(record.inputs),
    outputs: tuples(record.outputs),
  };
}

function shapeEdge<N, E>(graph: Graph<N, E>, id: EdgeId): EdgeShape<E> {
  const record = graph.edge(id)!;
  return {
    id,
    source: record.source,
    sourcePort: record.sourcePort,
    target: record.target,
    targetPort: record.targetPort,
    weight: record.weight,
  };
}

/**
 * 端口声明是否等价，取值口径与 `tuples` 一致。
 *
 * @remarks `copy()` 浅拷端口表，`Port` 实例在两图之间是共享的，因此绝大多数比较在第一个
 *   恒等判断上就短路了。
 */
function samePort(left: Port, right: Port): boolean {
  return (
    left === right ||
    (left.socket.name === right.socket.name &&
      left.multiple === right.multiple &&
      left.required === right.required &&
      structural(left.fallback, right.fallback))
  );
}

/**
 * 两侧端口集合是否等价。
 *
 * @remarks 逐字段比，而不是把两边各 `JSON.stringify` 一遍再比字符串：后者要为**每个节点**
 *   建一次元组数组再序列化，在 V=4000 的图上光判断"有没有节点改了形状"就要 36ms，
 *   编辑器里做实时 diff 直接不可用。逐字段比在第一个差异处即停。
 */
function sameShape(left: Ports, right: Ports): boolean {
  let paired = 0;
  for (const name of Object.keys(left)) {
    const port = left[name];
    if (!port) continue;
    const other = right[name];
    if (!other || !samePort(port, other)) return false;
    paired++;
  }
  for (const name of Object.keys(right)) if (right[name]) paired--;
  return paired === 0;
}

/** 边 id 会被回收复用，因此"同 id"不等于"同一条边"，还要比端点。 */
function sameEnds<E>(left: EdgeRecord<E>, right: EdgeRecord<E>): boolean {
  return (
    left.source === right.source &&
    left.sourcePort === right.sourcePort &&
    left.target === right.target &&
    left.targetPort === right.targetPort
  );
}

/**
 * 两图之间的结构化差异。端口结构变了的节点按"删除 + 重建"处理，
 * 因为端口是节点的形状，改形状等于换了个节点。
 */
export function diff<N, E>(
  before: Graph<N, E>,
  after: Graph<N, E>,
  options: DiffOptions = {},
): Array<Change<N, E>> {
  const equal = options.equal ?? structural;
  const changes: Array<Change<N, E>> = [];

  const reshaped = new Set<NodeId>();
  for (const id of after.nodes()) {
    const was = before.node(id);
    if (was === undefined) continue;
    const now = after.node(id)!;
    if (
      !sameShape(was.inputs, now.inputs) ||
      !sameShape(was.outputs, now.outputs)
    ) {
      reshaped.add(id);
    }
  }

  const removed = new Set<NodeId>();
  for (const id of before.nodes()) {
    if (!after.hasNode(id) || reshaped.has(id)) removed.add(id);
  }

  const relinked = new Set<EdgeId>();
  for (const id of after.edges()) {
    const was = before.edge(id);
    if (was === undefined) continue;
    if (!sameEnds(was, after.edge(id)!)) relinked.add(id);
  }

  for (const id of before.edges()) {
    const edge = shapeEdge(before, id);
    if (
      !after.hasEdge(id) ||
      relinked.has(id) ||
      removed.has(edge.source) ||
      removed.has(edge.target)
    ) {
      changes.push({ kind: "dropEdge", edge });
    }
  }
  for (const id of removed) {
    changes.push({ kind: "dropNode", node: shapeNode(before, id) });
  }

  for (const id of after.nodes()) {
    if (!before.hasNode(id) || reshaped.has(id)) {
      changes.push({ kind: "addNode", node: shapeNode(after, id) });
      continue;
    }
    const from = before.weightOf(id);
    const to = after.weightOf(id);
    if (!equal(from, to))
      changes.push({ kind: "weighNode", node: id, from, to });
  }

  for (const id of after.edges()) {
    const edge = shapeEdge(after, id);
    if (
      !before.hasEdge(id) ||
      relinked.has(id) ||
      removed.has(edge.source) ||
      removed.has(edge.target)
    ) {
      changes.push({ kind: "addEdge", edge });
      continue;
    }
    const from = before.edgeWeight(id);
    if (!equal(from, edge.weight)) {
      changes.push({ kind: "weighEdge", edge: id, from, to: edge.weight });
    }
  }

  for (const id of after.nodes()) {
    const to = after.parent(id);
    const from = before.parent(id);
    // 节点自身或其父被重建时，`dropNode` 已经把这条父子边拆掉了（子节点被提升到祖父），
    // 因此前后一致也要产出一条 reparent 去重新挂上，否则改了端口的分组会丢掉全部子节点。
    // `from` 保留真实值而不是填 undefined，`invert` 才能对称地还原回去。
    const detached = to !== undefined && (removed.has(id) || removed.has(to));
    if (from !== to || detached) {
      changes.push({ kind: "reparent", node: id, from, to });
    }
  }
  return changes;
}

export interface ApplyOptions {
  sockets?: SocketLookup;
}

/**
 * 把补丁落到图上。
 *
 * @remarks 分两趟：先结构（增删节点与边）再属性（权重与层级）。`invert` 只是把列表倒序，
 *   倒序会把 reparent 甩到节点重建之前，那时父节点还不存在，父链就落不下去。分趟之后
 *   `apply` 与列表内的相对次序无关，正向补丁与逆向补丁走的是同一条路。
 */
export function apply<N, E>(
  graph: Graph<N, E>,
  changes: ReadonlyArray<Change<N, E>>,
  options: ApplyOptions = {},
): void {
  const sockets = resolve(options.sockets);
  graph.batch(() => {
    for (const change of changes) {
      switch (change.kind) {
        case "dropEdge":
          graph.disconnect(change.edge.id);
          break;
        case "dropNode":
          graph.dropNode(change.node.id);
          break;
        case "addNode":
          graph.addNode({
            id: change.node.id,
            weight: change.node.weight,
            inputs: restore(change.node.inputs, sockets),
            outputs: restore(change.node.outputs, sockets),
          });
          break;
        case "addEdge":
          graph.connect(
            [change.edge.source, change.edge.sourcePort],
            [change.edge.target, change.edge.targetPort],
            { id: change.edge.id, weight: change.edge.weight },
          );
          break;
      }
    }
    for (const change of changes) {
      switch (change.kind) {
        case "weighNode":
          if (graph.hasNode(change.node)) {
            graph.setWeight(change.node, change.to);
          }
          break;
        case "weighEdge":
          if (graph.hasEdge(change.edge)) {
            graph.setEdgeWeight(change.edge, change.to);
          }
          break;
        case "reparent":
          if (!graph.hasNode(change.node)) break;
          if (change.to === undefined) graph.unparent(change.node);
          else if (graph.hasNode(change.to)) {
            graph.setParent(change.node, change.to);
          }
          break;
      }
    }
  });
}

/** 逆向补丁，用于撤销。 */
export function invert<N, E>(
  changes: ReadonlyArray<Change<N, E>>,
): Array<Change<N, E>> {
  const inverted: Array<Change<N, E>> = [];
  for (let i = changes.length - 1; i >= 0; i--) {
    const change = changes[i]!;
    switch (change.kind) {
      case "addNode":
        inverted.push({ kind: "dropNode", node: change.node });
        break;
      case "dropNode":
        inverted.push({ kind: "addNode", node: change.node });
        break;
      case "addEdge":
        inverted.push({ kind: "dropEdge", edge: change.edge });
        break;
      case "dropEdge":
        inverted.push({ kind: "addEdge", edge: change.edge });
        break;
      // 三种"改属性"的逆向都只是把 from / to 对调，但分支不能合并：合并后
      // `change` 退回三者的联合，`from` / `to` 变成 `NodeId | N | E`，落不回任何
      // 一个变体，只能靠断言硬塞。宁可留三行同形代码，也不引入断言。
      case "weighNode":
        inverted.push({ ...change, from: change.to, to: change.from });
        break;
      case "weighEdge":
        inverted.push({ ...change, from: change.to, to: change.from });
        break;
      case "reparent":
        inverted.push({ ...change, from: change.to, to: change.from });
        break;
    }
  }
  return inverted;
}
