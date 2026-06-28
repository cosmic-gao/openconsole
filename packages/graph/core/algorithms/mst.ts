import { PairingHeap } from '@openconsole/heap';

import { undirected } from '../adapters';
import type { Catalog, EdgeView, IntoEdges, Neighbors, NodeId } from '../types';

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

export function prim<E, G extends Catalog & Neighbors & IntoEdges<E>>(
  graph: G,
  edgeCost: (edge: EdgeView<E>) => number,
  root?: NodeId,
): Link[] {
  const view = undirected(graph);
  const result: Link[] = [];

  let first = root;
  if (first === undefined) {
    for (const id of view.nodes()) {
      first = id;
      break;
    }
  }
  if (first === undefined) return result;

  const inTree = new Set<NodeId>();
  const heap = new PairingHeap<Cross>((a, b) => a.weight - b.weight);

  const expand = (node: NodeId): void => {
    inTree.add(node);
    for (const edge of view.outEdges(node)) {
      if (!inTree.has(edge.target)) {
        heap.push({ node: edge.target, from: node, weight: edgeCost(edge) });
      }
    }
  };

  expand(first);
  while (!heap.empty()) {
    const cross = heap.poll()!;
    if (inTree.has(cross.node)) continue;
    result.push({ source: cross.from, target: cross.node, weight: cross.weight });
    expand(cross.node);
  }

  return result;
}

export function kruskal<E, G extends Catalog & IntoEdges<E>>(
  graph: G,
  edgeCost: (edge: EdgeView<E>) => number,
): Link[] {
  const links: Link[] = [];
  for (const edge of graph.edgeViews()) {
    links.push({ source: edge.source, target: edge.target, weight: edgeCost(edge) });
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
