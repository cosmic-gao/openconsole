/**
 * 类型声明的单一入口（品牌 ID、Socket 字典、访问者 trait、DFS 事件等）。
 *
 * @remarks
 * 命名约定：
 * - 类型名优先使用单个英文单词；不得已使用两词组合（如 `NodeId`、`PortId`、`EdgeView`）。
 * - 能力型 trait 用集合 / 动作的单数名词命名（{@link Catalog}、{@link Neighbors}、{@link Edges}、
 *   {@link Visitable}、{@link Walkable}）；挑不出贴切单词时保留 `Into*` 前缀
 *   （如 {@link IntoEdgeViews}、{@link IntoDegree}）。
 * - trait 方法亦优先单词形：`bound` / `at` / `marks` / `reset` / `neighbors`，
 *   方向语义通过可选 `direction` 参数传入而不是新方法。
 */

declare const __brand: unique symbol;

// 运行时类位于 ./classic；这里只用 `import type` 引入它们的类型形状，避免循环并保持 types.ts 仅类型。
import type { Edge, Input, Node, Output, Port, Socket } from './classic';

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
 * @remarks
 * 同时用于：
 * - 端口的方向（输入端口 / 输出端口）；
 * - 边相对某个节点的方向（流入方为 `'input'`，流出方为 `'output'`）。
 */
export type Direction = 'input' | 'output';

/** 节点端口名 → Socket 的映射，用于声明节点的输入/输出形态。 */
export type Sockets = { readonly [key: string]: Socket };

/**
 * 由 {@link Sockets} 推导出的输入端口字典类型。
 *
 * @template I 端口字典的 Sockets 形态
 */
export type Inputs<I extends Sockets> = { [K in keyof I]?: Input<I[K]> };

/**
 * 由 {@link Sockets} 推导出的输出端口字典类型。
 *
 * @template O 端口字典的 Sockets 形态
 */
export type Outputs<O extends Sockets> = { [K in keyof O]?: Output<O[K]> };

/**
 * Graph 内部存储节点时使用的擦除态类型。
 *
 * @remarks
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

/** 拓扑排序时返回的环路信息。 */
export interface Cycles {
  /** 是否检测到环。 */
  hasCycle: boolean;
  /** 环上的节点 ID 列表；无环时为空数组。 */
  cycleNodes: NodeId[];
}

/** 拓扑排序结果。 */
export interface Topology {
  /** 拓扑顺序的节点 ID 序列；含环时环上节点按原始顺序追加在末尾。 */
  order: NodeId[];
  /** 排序过程中收集的环路信息。 */
  cycles: Cycles;
}

/** 入度/出度信息 - 算法消费用。 */
export interface Degree {
  /** 流入节点的边数。 */
  inDegree: number;
  /** 流出节点的边数。 */
  outDegree: number;
}

/**
 * 边的轻量值视图，与具体存储解耦。
 *
 * @remarks
 * - 算法层只依赖 `EdgeView<E>` 即可遍历边；具体图实现不需要暴露 {@link Edge} 类。
 * - 翻转视图（{@link Reversed}）等零成本适配器仅交换 `source` / `target`，无需重新构造重型 {@link Edge}。
 *
 * @template E 边权重类型
 */
export interface EdgeView<E = unknown> {
  /** 边唯一标识。 */
  readonly id: EdgeId;
  /** 起点节点 ID。 */
  readonly source: NodeId;
  /** 终点节点 ID。 */
  readonly target: NodeId;
  /** 边权重；缺省时为 `undefined`。 */
  readonly weight: E | undefined;
}

/** 最小图接口 - 所有图实现必须提供的能力。 */
export interface Catalog {
  /** 节点 ID 的可迭代视图。 */
  readonly nodeIds: Iterable<NodeId>;
  /** 边 ID 的可迭代视图。 */
  readonly edgeIds: Iterable<EdgeId>;
  /** 当前节点总数。 */
  nodeCount(): number;
  /** 当前边总数。 */
  edgeCount(): number;
}

/**
 * 能列举直接邻居（出/入邻居）。
 *
 * @remarks
 * 用 `direction` 可选参数代替 petgraph 的 `IntoNeighborsDirected` 子 trait：
 * - 缺省：返回 前驱 + 后继（可能含重复，与原 `neighbors(node)` 行为一致）；
 * - `'input'`：仅前驱；
 * - `'output'`：仅后继。
 *
 * 调用方在编译期已知方向时，应直接使用 {@link incomingNeighbors} / {@link outgoingNeighbors}
 * （明确语义、避免 `direction` 参数转发）。`neighbors(node, dir)` 仅在算法 / 适配器
 * 需要按运行时方向分派时使用。
 */
export interface Neighbors {
  /** 邻居迭代；缺省返回前驱 + 后继。 */
  neighbors(nodeId: NodeId, direction?: Direction): Iterable<NodeId>;
  /** 仅前驱（流入侧邻居），等价于 `neighbors(nodeId, 'input')`。 */
  incomingNeighbors(nodeId: NodeId): Iterable<NodeId>;
  /** 仅后继（流出侧邻居），等价于 `neighbors(nodeId, 'output')`。 */
  outgoingNeighbors(nodeId: NodeId): Iterable<NodeId>;
}

/**
 * 能列举边（出/入边）。
 *
 * @template E 边权重类型
 */
export interface Edges<E = unknown> {
  /** 与节点关联的所有边（流入 + 流出）。 */
  edges(nodeId: NodeId): Iterable<Edge<E>>;
  /** 流入节点的边。 */
  incomingEdges(nodeId: NodeId): Iterable<Edge<E>>;
  /** 流出节点的边。 */
  outgoingEdges(nodeId: NodeId): Iterable<Edge<E>>;
}

/**
 * 能列举边的轻量视图 ({@link EdgeView})。
 *
 * @remarks
 * petgraph 的 `IntoEdgeReferences` 类比物。任意存储（`Graph`、`MapGraph`、`MatrixGraph`、`Reversed`）
 * 都可以低成本地实现该 trait，从而被同一份算法消费。
 *
 * @template E 边权重类型
 */
export interface IntoEdgeViews<E = unknown> {
  /** 全图所有边视图。 */
  getEdges(): Iterable<EdgeView<E>>;
  /** 流入节点的边视图。 */
  getIncomingEdges(nodeId: NodeId): Iterable<EdgeView<E>>;
  /** 流出节点的边视图。 */
  getOutgoingEdges(nodeId: NodeId): Iterable<EdgeView<E>>;
}

/**
 * 节点可索引化 - 用于数组型算法（如 Dijkstra 的距离数组、Floyd-Warshall 的二维矩阵）。
 *
 * @remarks
 * 索引语义跟 petgraph 的 `NodeIndexable` 对齐：
 * - {@link bound} 给出有效索引的上界（不一定等于 {@link Catalog.nodeCount}）；
 * - 索引可以是 **稀疏** 的——某些 `i ∈ [0, bound())` 处 {@link at} 返回 `undefined`
 *   （例如 {@link MatrixGraph} 的墓碑位）；
 * - 算法应当遍历 `[0, bound())` 并自行跳过 `undefined` 槽，不要假设 `at(i)` 一定有值。
 */
export interface NodeIndexable {
  /**
   * 节点索引的上界（不含）。
   *
   * @remarks
   * - 稠密存储（`Graph` / `MapGraph`）：等于 `nodeCount()`；
   * - 稀疏存储（`MatrixGraph` 含墓碑）：可能 `> nodeCount()`，等于内部槽位总数。
   */
  bound(): number;
  /** 按索引获取节点 ID；越界或槽位为空（墓碑）时返回 `undefined`。 */
  at(index: number): NodeId | undefined;
  /** 节点的索引；不存在返回 `-1`。 */
  indexOf(nodeId: NodeId): number;
}

/** 能维护已访问集合 - 用于遍历算法。 */
export interface Visitable {
  /** 创建一张全部初始化为 `false` 的访问位图。 */
  marks(): Map<NodeId, boolean>;
  /** 把传入的访问位图全部重置为 `false`（原地修改）。 */
  reset(map: Map<NodeId, boolean>): void;
}

/** 能直接给出度数 - 拓扑排序、入口分析等算法消费。 */
export interface IntoDegree {
  /** 流入边数。 */
  inDegree(nodeId: NodeId): number;
  /** 流出边数。 */
  outDegree(nodeId: NodeId): number;
}

/**
 * 图的只读视图 - 供算法消费。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 */
export interface GraphView<N = unknown, E = unknown>
  extends Catalog,
  Neighbors,
  Edges<E>,
  NodeIndexable,
  Visitable {
  /** 按 ID 取节点；不存在返回 `undefined`。 */
  getNode(nodeId: NodeId): StoredNode<N> | undefined;
  /** 按 ID 取边；不存在返回 `undefined`。 */
  getEdge(edgeId: EdgeId): Edge<E> | undefined;
}

/** 算法常用的最小约束：可枚举节点 + 列举出邻居。 */
export type Walkable = Catalog & Neighbors;

/**
 * 访问者回调返回值，模仿 petgraph 的 `Control<B>`。
 *
 * @remarks
 * - `'continue'`：继续访问；
 * - `'prune'`：保留当前节点的访问，但不再下钻其后继；
 * - `'break'`：立即中止整次遍历。
 */
export type Control = 'continue' | 'prune' | 'break';

/**
 * DFS 访问事件。
 *
 * @remarks 与 petgraph `DfsEvent` 对齐，便于 dominator/topo/SCC 等算法基于事件流编写。
 *
 * @template T 用户载荷类型，预留给计时器（discover/finish 时间戳）等扩展使用
 */
export interface DfsEvent<T = number> {
  /** 事件种类（直接以字符串字面量联合给出，无需额外的 `Kind` 别名）。 */
  readonly kind: 'discover' | 'finish' | 'treeEdge' | 'backEdge' | 'crossForwardEdge';
  /** 主节点 ID（discover/finish 时即当前节点；treeEdge 等事件时即源节点）。 */
  readonly node: NodeId;
  /** 边事件的目标节点 ID；非边事件时为 `undefined`。 */
  readonly target?: NodeId;
  /** 事件发生时的时间戳（discover/finish 计数）。 */
  readonly time?: T;
}
