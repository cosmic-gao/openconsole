import type { Graph } from "../graph";
import type { NodeId } from "../ident";
import { inDegree, outDegree, type Ints, type Structure } from "../snapshot";

/** 全图度数，下标即节点索引。 */
export interface Degrees {
  readonly inbound: Int32Array;
  readonly outbound: Int32Array;
}

export function degrees(structure: Structure): Degrees {
  const inward = new Int32Array(structure.order);
  const outward = new Int32Array(structure.order);
  for (let u = 0; u < structure.order; u++) {
    inward[u] = inDegree(structure, u);
    outward[u] = outDegree(structure, u);
  }
  return { inbound: inward, outbound: outward };
}

/** 入度为 0 的节点索引。 */
export const sources = (structure: Structure): Int32Array =>
  select(structure, (u) => inDegree(structure, u) === 0);

/** 出度为 0 的节点索引。 */
export const sinks = (structure: Structure): Int32Array =>
  select(structure, (u) => outDegree(structure, u) === 0);

/** 入度与出度都为 0 的节点索引。 */
export const isolated = (structure: Structure): Int32Array =>
  select(
    structure,
    (u) => inDegree(structure, u) === 0 && outDegree(structure, u) === 0,
  );

function select(
  structure: Structure,
  keep: (u: number) => boolean,
): Int32Array {
  const found = new Int32Array(structure.order);
  let at = 0;
  for (let u = 0; u < structure.order; u++) {
    if (keep(u)) found[at++] = u;
  }
  return found.subarray(0, at);
}

const EMPTY: Ints = new Int32Array(0);

/**
 * 邻居查询：直接切 CSR，返回底层数组的**视图**——不复制、不给每个节点分配数组。
 * 物化一份的话就是 V 个对象加 2V 个数组，而绝大多数调用只会看其中几个节点。
 */
export class Neighborhood {
  public constructor(private readonly _structure: Structure) {}

  public successors(u: number): Ints {
    const { offset, other } = this._structure.outbound;
    return other.subarray(offset[u]!, offset[u + 1]!);
  }

  public predecessors(u: number): Ints {
    const inbound = this._structure.inbound;
    if (!inbound) return EMPTY;
    return inbound.other.subarray(inbound.offset[u]!, inbound.offset[u + 1]!);
  }
}

export const neighborhood = (structure: Structure): Neighborhood =>
  new Neighborhood(structure);

/** 复合层级的顶层节点。层级只存在于可变图上，故这三个查询接受 {@link Graph}。 */
export function roots(graph: Graph): NodeId[] {
  return graph.nodes().filter((node) => graph.parent(node) === undefined);
}

/** 以 `root` 为根的子树全部节点，含自身。 */
export function subtree(graph: Graph, root: NodeId): NodeId[] {
  const found: NodeId[] = [];
  const stack: NodeId[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    found.push(node);
    stack.push(...graph.children(node));
  }
  return found;
}

/** 自底向上的祖先链，不含自身。 */
export function ancestry(graph: Graph, node: NodeId): NodeId[] {
  const chain: NodeId[] = [];
  for (
    let cursor = graph.parent(node);
    cursor !== undefined;
    cursor = graph.parent(cursor)
  ) {
    chain.push(cursor);
  }
  return chain;
}
