import { EMPTY } from "../support";
import type {
  Catalog,
  Direction,
  EdgeId,
  Hierarchy,
  Neighbors,
  NodeId,
} from "../types";

/**
 * 折叠视图：把指定 group 当作单个节点，聚合跨层边，输出仍是合法的可遍历图。零成本，不复制数据。
 * @typeParam G 内层图
 */
export class Collapsed<G extends Catalog & Neighbors & Hierarchy>
  implements Catalog, Neighbors
{
  private readonly _collapsed: Set<NodeId>;

  public constructor(
    public readonly inner: G,
    collapsed: Iterable<NodeId>,
  ) {
    this._collapsed = new Set(collapsed);
  }

  public get order(): number {
    let count = 0;
    for (const _ of this.nodes()) count++;
    return count;
  }

  public get size(): number {
    return 0;
  }

  public *nodes(): Iterable<NodeId> {
    for (const node of this.inner.nodes()) if (!this.hidden(node)) yield node;
  }

  public edges(): Iterable<EdgeId> {
    return EMPTY;
  }

  public neighbors(node: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction === "input") return this.inNeighbors(node);
    if (direction === "output") return this.outNeighbors(node);
    return this.both(node);
  }

  public *outNeighbors(node: NodeId): Iterable<NodeId> {
    const seen = new Set<NodeId>();
    for (const member of this.members(node)) {
      for (const neighbor of this.inner.outNeighbors(member)) {
        const rep = this.represent(neighbor);
        if (rep !== node && !seen.has(rep)) {
          seen.add(rep);
          yield rep;
        }
      }
    }
  }

  public *inNeighbors(node: NodeId): Iterable<NodeId> {
    const seen = new Set<NodeId>();
    for (const member of this.members(node)) {
      for (const neighbor of this.inner.inNeighbors(member)) {
        const rep = this.represent(neighbor);
        if (rep !== node && !seen.has(rep)) {
          seen.add(rep);
          yield rep;
        }
      }
    }
  }

  private *both(node: NodeId): Iterable<NodeId> {
    yield* this.outNeighbors(node);
    yield* this.inNeighbors(node);
  }

  private represent(node: NodeId): NodeId {
    let rep = node;
    let cursor = this.inner.parent(node);
    while (cursor !== undefined) {
      if (this._collapsed.has(cursor)) rep = cursor;
      cursor = this.inner.parent(cursor);
    }
    return rep;
  }

  private hidden(node: NodeId): boolean {
    let cursor = this.inner.parent(node);
    while (cursor !== undefined) {
      if (this._collapsed.has(cursor)) return true;
      cursor = this.inner.parent(cursor);
    }
    return false;
  }

  private *members(node: NodeId): Iterable<NodeId> {
    yield node;
    if (!this._collapsed.has(node)) return;
    const stack = [...this.inner.children(node)];
    while (stack.length > 0) {
      const child = stack.pop()!;
      yield child;
      for (const grand of this.inner.children(child)) stack.push(grand);
    }
  }
}

/** 创建折叠视图，将 groups 中的节点各自折叠为单节点。 */
export function collapse<G extends Catalog & Neighbors & Hierarchy>(
  graph: G,
  groups: Iterable<NodeId>,
): Collapsed<G> {
  return new Collapsed(graph, groups);
}
