import { PairingHeap } from "@openconsole/heap";

import { undirected } from "../adapters";
import type { Catalog, EdgeView, IntoEdges, Neighbors, NodeId } from "../types";

/** 最小生成森林中的一条选中边：端点 source、target 及其权重 weight。 */
export interface Link {
  source: NodeId;
  target: NodeId;
  weight: number;
}

interface Cross {
  readonly node: NodeId;
  readonly from: NodeId;
  readonly weight: number;
}

/**
 * Prim 算法求最小生成森林：按无向视角逐个分量从堆中取最小跨越边扩展。
 * 非连通图会得到每个连通分量各自的最小生成树。
 * @returns 选中的生成树边列表。
 */
export function prim<E, G extends Catalog & Neighbors & IntoEdges<E>>(
  graph: G,
  edgeCost: (edge: EdgeView<E>) => number,
): Link[] {
  const view = undirected(graph);
  const inTree = new Set<NodeId>();
  const result: Link[] = [];
  const heap = new PairingHeap<Cross>((a, b) => a.weight - b.weight);

  const expand = (node: NodeId): void => {
    inTree.add(node);
    for (const edge of view.outEdges(node)) {
      if (!inTree.has(edge.target)) {
        heap.push({ node: edge.target, from: node, weight: edgeCost(edge) });
      }
    }
  };

  for (const root of view.nodes()) {
    if (inTree.has(root)) continue;
    expand(root);
    while (!heap.empty()) {
      const cross = heap.poll()!;
      if (inTree.has(cross.node)) continue;
      result.push({
        source: cross.from,
        target: cross.node,
        weight: cross.weight,
      });
      expand(cross.node);
    }
  }

  return result;
}

/**
 * Kruskal 算法求最小生成森林：按权升序遍历边，用并查集合并不成环者。
 * 非连通图会得到每个连通分量各自的最小生成树。
 * @returns 选中的生成树边列表。
 */
export function kruskal<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
  edgeCost: (edge: EdgeView<E>) => number,
): Link[] {
  const links: Link[] = [];
  for (const edge of graph.edgeViews()) {
    links.push({
      source: edge.source,
      target: edge.target,
      weight: edgeCost(edge),
    });
  }
  links.sort((a, b) => a.weight - b.weight);

  const parent = new Map<NodeId, NodeId>();
  const ensure = (node: NodeId): void => {
    if (!parent.has(node)) parent.set(node, node);
  };
  const find = (node: NodeId): NodeId => {
    let root = node;
    while (parent.get(root)! !== root) root = parent.get(root)!;
    let cursor = node;
    while (cursor !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  const result: Link[] = [];
  for (const link of links) {
    ensure(link.source);
    ensure(link.target);
    const a = find(link.source);
    const b = find(link.target);
    if (a !== b) {
      parent.set(a, b);
      result.push(link);
    }
  }
  return result;
}
