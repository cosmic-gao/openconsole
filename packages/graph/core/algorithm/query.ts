import type { Graph } from "../graph";
import type { NodeId } from "../ident";
import {
  inboundOf,
  type Adjacency,
  type Ints,
  type Structure,
} from "../snapshot";

/** 全图度数，下标即节点索引。 */
export interface Degrees {
  readonly inbound: Int32Array;
  readonly outbound: Int32Array;
}

/** @throws {@link Oneway} 结构只编了出向 */
export function degrees(structure: Structure): Degrees {
  const back = inboundOf(structure, "degrees");
  const { offset } = structure.outbound;
  const inward = new Int32Array(structure.order);
  const outward = new Int32Array(structure.order);
  for (let u = 0; u < structure.order; u++) {
    inward[u] = back.offset[u + 1]! - back.offset[u]!;
    outward[u] = offset[u + 1]! - offset[u]!;
  }
  return { inbound: inward, outbound: outward };
}

/** 入度为 0 的节点索引。@throws {@link Oneway} 结构只编了出向 */
export const sources = (structure: Structure): Int32Array =>
  barren(structure, inboundOf(structure, "sources"));

/** 出度为 0 的节点索引。 */
export const sinks = (structure: Structure): Int32Array =>
  barren(structure, structure.outbound);

/** 入度与出度都为 0 的节点索引。@throws {@link Oneway} 结构只编了出向 */
export function isolated(structure: Structure): Int32Array {
  const back = inboundOf(structure, "isolated");
  const { offset } = structure.outbound;
  return select(
    structure,
    (u) =>
      offset[u + 1]! === offset[u]! &&
      back.offset[u + 1]! === back.offset[u]!,
  );
}

/** 在给定方向上没有任何关联边的节点索引。 */
function barren(structure: Structure, side: Adjacency): Int32Array {
  const { offset } = side;
  return select(structure, (u) => offset[u + 1]! === offset[u]!);
}

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

  /** @throws {@link Oneway} 结构只编了出向——给空数组就等于谎报"没有前驱" */
  public predecessors(u: number): Ints {
    const back = inboundOf(this._structure, "Neighborhood.predecessors");
    return back.other.subarray(back.offset[u]!, back.offset[u + 1]!);
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
