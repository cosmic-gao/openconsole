import type { EdgeId, NodeId } from "./brand";
import type { Direction } from "./port";

/** 最小图能力：枚举与计数节点 / 边。 */
export interface Catalog {
  /** 节点总数。 */
  readonly order: number;
  /** 边总数。 */
  readonly size: number;
  nodes(): Iterable<NodeId>;
  edges(): Iterable<EdgeId>;
}

/** 邻接能力。 */
export interface Neighbors {
  /** 缺省 `direction` 时返回入向与出向的全部邻居。 */
  neighbors(node: NodeId, direction?: Direction): Iterable<NodeId>;
  inNeighbors(node: NodeId): Iterable<NodeId>;
  outNeighbors(node: NodeId): Iterable<NodeId>;
}

/** 可遍历图：{@link Catalog} + {@link Neighbors}。 */
export type Walkable = Catalog & Neighbors;

/** 节点的入度与出度。 */
export interface Degree {
  inDegree: number;
  outDegree: number;
}

/** 度数查询能力。 */
export interface IntoDegree {
  inDegree(node: NodeId): number;
  outDegree(node: NodeId): number;
}

/** 节点索引能力：节点 ID 与整数下标的 O(1) 互转。 */
export interface NodeIndexable {
  /** 下标上界，取值范围 `0 .. bound()-1`。 */
  bound(): number;
  /** 越界或空位返回 `undefined`。 */
  at(index: number): NodeId | undefined;
  /** 未登记返回 `-1`。 */
  indexOf(node: NodeId): number;
}

/** 复合图层级能力。 */
export interface Hierarchy {
  /** 根节点返回 `undefined`。 */
  parent(node: NodeId): NodeId | undefined;
  children(node: NodeId): Iterable<NodeId>;
}

/** 轻量边视图：边的只读快照。 */
export interface EdgeView<E = unknown> {
  readonly id: EdgeId;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly weight: E | undefined;
}

/** 边视图能力。 */
export interface IntoEdges<E = unknown> {
  edgeViews(): Iterable<EdgeView<E>>;
  inEdges(node: NodeId): Iterable<EdgeView<E>>;
  outEdges(node: NodeId): Iterable<EdgeView<E>>;
}

/** 从图类型推断其边权重类型。 */
export type EdgeOf<G> = G extends IntoEdges<infer E> ? E : unknown;
