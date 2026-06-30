import type { EdgeId, NodeId } from "./brand";
import type { Direction } from "./port";

/** 最小图能力：枚举与计数节点 / 边。 */
export interface Catalog {
  /** 节点总数。 */
  readonly order: number;
  /** 边总数。 */
  readonly size: number;
  /** 遍历所有节点 ID。 */
  nodes(): Iterable<NodeId>;
  /** 遍历所有边 ID。 */
  edges(): Iterable<EdgeId>;
}

/** 邻接能力：获取节点的相邻节点。 */
export interface Neighbors {
  /** 按方向枚举邻居，缺省方向时返回全部相邻节点。 */
  neighbors(node: NodeId, direction?: Direction): Iterable<NodeId>;
  /** 枚举入向邻居（指向该节点的源节点）。 */
  inNeighbors(node: NodeId): Iterable<NodeId>;
  /** 枚举出向邻居（该节点指向的目标节点）。 */
  outNeighbors(node: NodeId): Iterable<NodeId>;
}

/** 可遍历图：同时具备枚举计数（Catalog）与邻接（Neighbors）能力。 */
export type Walkable = Catalog & Neighbors;

/** 节点度数（入度与出度）。 */
export interface Degree {
  /** 入度（入向边数量）。 */
  inDegree: number;
  /** 出度（出向边数量）。 */
  outDegree: number;
}

/** 度数查询能力：按节点计算入度 / 出度。 */
export interface IntoDegree {
  /** 计算节点入度。 */
  inDegree(node: NodeId): number;
  /** 计算节点出度。 */
  outDegree(node: NodeId): number;
}

/** 节点索引能力：节点 ID 与整数下标的 O(1) 互转。 */
export interface NodeIndexable {
  /** 索引上界（下标范围为 0 至 bound-1）。 */
  bound(): number;
  /** 按下标取节点 ID，越界返回 undefined。 */
  at(index: number): NodeId | undefined;
  /** 取节点对应的下标，不存在返回 -1。 */
  indexOf(node: NodeId): number;
}

/** 复合图层级能力：节点的父子关系。 */
export interface Hierarchy {
  /** 获取父节点，根节点返回 undefined。 */
  parent(node: NodeId): NodeId | undefined;
  /** 枚举直接子节点。 */
  children(node: NodeId): Iterable<NodeId>;
}

/**
 * 轻量边视图：边的只读快照（ID、端点与权重）。
 * @typeParam E - 边权重类型。
 */
export interface EdgeView<E = unknown> {
  /** 边 ID。 */
  readonly id: EdgeId;
  /** 源节点 ID。 */
  readonly source: NodeId;
  /** 目标节点 ID。 */
  readonly target: NodeId;
  /** 边权重，缺省时为 undefined。 */
  readonly weight: E | undefined;
}

/**
 * 边视图能力：以轻量视图形式枚举边。
 * @typeParam E - 边权重类型。
 */
export interface IntoEdges<E = unknown> {
  /** 枚举所有边视图。 */
  edgeViews(): Iterable<EdgeView<E>>;
  /** 枚举节点的入向边视图。 */
  inEdges(node: NodeId): Iterable<EdgeView<E>>;
  /** 枚举节点的出向边视图。 */
  outEdges(node: NodeId): Iterable<EdgeView<E>>;
}

/**
 * 从图类型推断其边权重类型。
 * @typeParam G - 实现 IntoEdges 的图类型。
 */
export type EdgeOf<G> = G extends IntoEdges<infer E> ? E : unknown;
