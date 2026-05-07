/**
 * 类型声明的单一入口。
 *
 * 把所有公共类型（品牌 ID、Socket 字典、邻接缓存形状、算法接口等）集中在此处，
 * 实现细节（class、运行时常量）则保留在 {@link ./index} 与算法文件里。
 *
 * 命名约定：
 * - 类型名优先使用单个英文单词；不得已使用两词组合（如 `NodeId`、`PortId`）。
 * - 接口前缀 `Into*` 为 petgraph 风格的能力 trait。
 */

declare const __brand: unique symbol;

/**
 * 在结构类型上叠加品牌标记，制造名义类型 (nominal typing)。
 *
 * @template T 底层值类型
 * @template B 品牌字符串字面量
 */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** 节点的唯一标识。 */
export type NodeId = Brand<string, 'NodeId'>;

/** 边的唯一标识。 */
export type EdgeId = Brand<string, 'EdgeId'>;

/** 端口的唯一标识。 */
export type PortId = Brand<string, 'PortId'>;

/** 图的唯一标识。 */
export type GraphId = Brand<string, 'GraphId'>;

/**
 * 方向：`'input'` 或 `'output'`。
 *
 * 同时用于：
 * - 端口的方向（输入端口 / 输出端口）；
 * - 边相对某个节点的方向（流入方为 `'input'`，流出方为 `'output'`）。
 */
export type Direction = 'input' | 'output';

// 运行时类位于 ./classic；这里只用 `import type` 引入它们的类型形状，避免循环并保持 types.ts 仅类型。
import type { Edge, Input, Node, Output, Port, Socket } from './classic';

/** 节点端口名 → Socket 的映射，用于声明节点的输入/输出形态。 */
export type Sockets = { readonly [key: string]: Socket };

/** 由 {@link Sockets} 推导出的输入端口字典类型。 */
export type Inputs<I extends Sockets> = { [K in keyof I]?: Input<I[K]> };

/** 由 {@link Sockets} 推导出的输出端口字典类型。 */
export type Outputs<O extends Sockets> = { [K in keyof O]?: Output<O[K]> };

/**
 * Graph 内部存储节点时使用的擦除态类型。
 *
 * 节点本身可保留具体的 Sockets 形态，但 Graph 不约束这些形态，因此存储层退化为 {@link Sockets}。
 *
 * @template W 节点数据载荷类型
 */
export type StoredNode<W = unknown> = Node<Sockets, Sockets, W>;

/**
 * 端口字典抽象 - 给底层算法/序列化用。
 *
 * @template P 端口具体类型
 */
export type PortDict<P extends Port = Port> = { readonly [key: string]: P | undefined };

/** 环路信息 - 拓扑排序时返回。 */
export interface CycleInfo {
  hasCycle: boolean;
  cycleNodes: NodeId[];
}

/** 拓扑排序结果。 */
export interface TopoSortResult {
  order: NodeId[];
  cycleInfo: CycleInfo;
}

/** 入度/出度信息 - 算法消费用。 */
export interface DegreeInfo {
  inDegree: number;
  outDegree: number;
}

/** 带权重的边引用 - 用于最短路径等算法。 */
export interface WeightedEdge<E = unknown> {
  readonly id: EdgeId;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly weight: E | undefined;
}

/** 邻接缓存 - 节点 ID → 出/入邻居与度数。 */
export interface Adjacency {
  outgoingEdges: Map<NodeId, EdgeId[]>;
  incomingEdges: Map<NodeId, EdgeId[]>;
  successors: Map<NodeId, NodeId[]>;
  predecessors: Map<NodeId, NodeId[]>;
  inDegree: Map<NodeId, number>;
  outDegree: Map<NodeId, number>;
}

// ============================================================
// 算法接口 (petgraph 风格的 visitor traits)
// ============================================================

/** 最小图接口 - 所有图实现必须提供的能力。 */
export interface GraphBase {
  readonly nodeIds: Iterable<NodeId>;
  readonly edgeIds: Iterable<EdgeId>;
  nodeCount(): number;
  edgeCount(): number;
}

/** 能列举直接邻居（出/入邻居）。 */
export interface IntoNeighbors {
  neighbors(nodeId: NodeId): Iterable<NodeId>;
  incomingNeighbors(nodeId: NodeId): Iterable<NodeId>;
  outgoingNeighbors(nodeId: NodeId): Iterable<NodeId>;
}

/**
 * 能列举边（出/入边）。
 *
 * @template E 边权重类型
 */
export interface IntoEdges<E = unknown> {
  edges(nodeId: NodeId): Iterable<Edge<E>>;
  incomingEdges(nodeId: NodeId): Iterable<Edge<E>>;
  outgoingEdges(nodeId: NodeId): Iterable<Edge<E>>;
}

/** 节点可索引化 - 用于数组型算法（如 Dijkstra 的距离数组）。 */
export interface NodeIndexable {
  nodeIdAt(index: number): NodeId | undefined;
  indexOf(nodeId: NodeId): number;
}

/** 能维护已访问集合 - 用于遍历算法。 */
export interface Visitable {
  visitMap(): Map<NodeId, boolean>;
  resetMap(map: Map<NodeId, boolean>): void;
}

/** 能直接给出度数 - 拓扑排序、入口分析等算法消费。 */
export interface IntoDegree {
  inDegree(nodeId: NodeId): number;
  outDegree(nodeId: NodeId): number;
}

/**
 * 图的只读视图 - 供算法消费。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export interface GraphRef<N = unknown, E = unknown>
  extends GraphBase,
    IntoNeighbors,
    IntoEdges<E>,
    NodeIndexable,
    Visitable {
  getNode(nodeId: NodeId): StoredNode<N> | undefined;
  getEdge(edgeId: EdgeId): Edge<E> | undefined;
}

/** 算法常用的最小约束：可枚举节点 + 列举出邻居。 */
export type Walkable = GraphBase & IntoNeighbors;

