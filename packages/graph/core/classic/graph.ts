/**
 * Graph：有向图主容器，承载节点与边并提供基础邻接查询。
 */

import { portsJson } from '../internal';
import type {
  Direction,
  EdgeId,
  EdgeView,
  GraphJson,
  JsonEdge,
  JsonNode,
  NodeId,
} from '../types';
import type { Edge } from './edge';
import { Emitter } from './emitter';

/**
 * 有向图，承载节点 (`Node`) 与边 (`Edge`)，并提供基础邻接查询。
 *
 * @remarks
 * 设计要点：
 * - **分层结构**：{@link Model}（储存 + CRUD + 基础 trait） → {@link Emitter}
 *   （叠加事件能力） → {@link Graph}（查询层）三层继承；本类只追加查询层
 *   （边查询、邻居、IntoEdges trait、度数、序列化）。
 * - **无中央缓存**：邻接关系直接由各端口自有的 {@link Port.edges} 列表派生，
 *   任何结构变更后查询立刻反映新状态，无失效钩子；
 * - **O(1) NodeIndexable**：通过 {@link Model} 组合的 {@link Registry}，
 *   {@link at} / {@link indexOf} / {@link bound} 全部 O(1)；`removeNode` 使用 swap-and-pop，
 *   节点索引顺序在删除时**可能被打乱**；
 * - **变更事件**：通过 {@link on} 订阅节点 / 边的 add / remove，可用于增量算法
 *   （如 `IncrementalTopo`）订阅。
 * - 拓扑排序、强连通分量等高阶算法不再挂在 Graph 上，请改用 {@link toposort} /
 *   {@link topology} / {@link scc} 等独立函数（仅依赖访问者 trait）。
 *
 * **两套边访问 API 如何选**：
 *
 * | API                              | 返回                       | 适用       |
 * | -------------------------------- | -------------------------- | ---------- |
 * | {@link incoming} / {@link outgoing} / {@link incident} | `Edge<E>[]`（数组 + 完整 Edge） | 用户面，需要直接读端口 / Endpoint |
 * | {@link getEdges} / {@link getIncoming} / {@link getOutgoing}          | `Iterable<EdgeView<E>>`（lazy + 轻量视图） | 算法 / 适配器层，跨 trait 复用 |
 *
 * **邻居 API 同理**：{@link predecessors} / {@link successors} / {@link adjacencies} 返回数组，
 * {@link upstream} / {@link downstream} / {@link neighbors} 返回 lazy generator。
 *
 * @template N 节点附带的数据载荷类型
 * @template E 边附带的数据载荷类型
 */
export class Graph<N = unknown, E = unknown> extends Emitter<N, E> {
  // #region 内部迭代器

  /**
   * 流式生成节点在指定方向上的边 ID（直接读端口的 `edges` 列表）。
   *
   * @internal
   */
  private *_edgeIds(nodeId: NodeId, direction: Direction): IterableIterator<EdgeId> {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    const ports = direction === 'input' ? node.inputs : node.outputs;
    for (const key in ports) {
      const port = ports[key];
      if (!port) continue;
      for (const id of port.edges) yield id;
    }
  }

  /**
   * 流式生成节点在指定方向上的边实例（自动跳过已被删除的孤儿 ID）。
   *
   * @internal
   */
  private *_edgesOf(nodeId: NodeId, direction: Direction): IterableIterator<Edge<E>> {
    for (const id of this._edgeIds(nodeId, direction)) {
      const edge = this.edges.get(id);
      if (edge) yield edge;
    }
  }

  // #endregion

  // #region 边查询（含 find / endpoints / adjacent）

  /**
   * 查找从 `source` 直接指向 `target` 的第一条边。
   *
   * @remarks 存在多重边时只返回首条；如需全部请用 {@link between}。
   *
   * @param source 起点节点 ID
   * @param target 终点节点 ID
   * @returns 边实例；不存在时返回 `undefined`
   */
  public findEdge(source: NodeId, target: NodeId): Edge<E> | undefined {
    for (const edge of this._edgesOf(source, 'output')) {
      if (edge.targetId === target) return edge;
    }
    return undefined;
  }

  /**
   * 取边的两端节点 ID。
   *
   * @param edgeId 边 ID
   * @returns `[sourceId, targetId]`；边不存在时返回 `undefined`
   */
  public endpoints(edgeId: EdgeId): [NodeId, NodeId] | undefined {
    const edge = this.edges.get(edgeId);
    return edge ? [edge.sourceId, edge.targetId] : undefined;
  }

  /**
   * 是否存在从 `source` 直接到 `target` 的边。
   *
   * @param source 起点节点 ID
   * @param target 终点节点 ID
   * @returns 是否相邻
   */
  public adjacent(source: NodeId, target: NodeId): boolean {
    return this.findEdge(source, target) !== undefined;
  }

  /**
   * 流入指定节点的所有边。
   *
   * @param nodeId 节点 ID
   * @returns 边数组
   */
  public incoming(nodeId: NodeId): Edge<E>[] {
    return Array.from(this._edgesOf(nodeId, 'input'));
  }

  /**
   * 流出指定节点的所有边。
   *
   * @param nodeId 节点 ID
   * @returns 边数组
   */
  public outgoing(nodeId: NodeId): Edge<E>[] {
    return Array.from(this._edgesOf(nodeId, 'output'));
  }

  /**
   * 与指定节点关联的所有边（流入 + 流出，**自环边只出现一次** — 边集去重语义）。
   *
   * @remarks 与 {@link adjacencies} / {@link neighbors} 的"端点序列"语义不同：
   *   后者对自环节点会 yield 两次（一次 as predecessor、一次 as successor）。
   *
   * @see {@link adjacencies}
   *
   * @param nodeId 节点 ID
   * @returns 边数组
   */
  public incident(nodeId: NodeId): Edge<E>[] {
    const seen = new Set<EdgeId>();
    const result: Edge<E>[] = [];
    for (const edge of this._edgesOf(nodeId, 'output')) {
      seen.add(edge.id);
      result.push(edge);
    }
    for (const edge of this._edgesOf(nodeId, 'input')) {
      if (seen.has(edge.id)) continue;
      result.push(edge);
    }
    return result;
  }

  /**
   * 从 `source` 直接指向 `target` 的所有有向边。
   *
   * @param source 起点节点 ID
   * @param target 终点节点 ID
   * @returns 边数组
   */
  public between(source: NodeId, target: NodeId): Edge<E>[] {
    const result: Edge<E>[] = [];
    for (const edge of this._edgesOf(source, 'output')) {
      if (edge.targetId === target) result.push(edge);
    }
    return result;
  }

  /**
   * 连接 `left` 与 `right` 的所有边（不区分方向）。
   *
   * @param left 一端的节点 ID
   * @param right 另一端的节点 ID
   * @returns 边数组
   */
  public connecting(left: NodeId, right: NodeId): Edge<E>[] {
    if (left === right) return this.between(left, right);
    return [...this.between(left, right), ...this.between(right, left)];
  }

  // #endregion

  // #region 邻居与度数（用户面数组形式）

  /**
   * 指定节点的前驱节点（直接指向它的节点）。
   *
   * @remarks 等价于 `Array.from(upstream(nodeId))`，为用户面提供的数组形式便捷封装；
   *   算法层应优先用 {@link upstream}（lazy generator）以避免中间数组。
   *
   * @param nodeId 节点 ID
   * @returns 节点 ID 数组
   */
  public predecessors(nodeId: NodeId): NodeId[] {
    return Array.from(this.upstream(nodeId));
  }

  /**
   * 指定节点的后继节点（被它直接指向的节点）。
   *
   * @remarks 等价于 `Array.from(downstream(nodeId))`，为用户面提供的数组形式便捷封装。
   *
   * @param nodeId 节点 ID
   * @returns 节点 ID 数组
   */
  public successors(nodeId: NodeId): NodeId[] {
    return Array.from(this.downstream(nodeId));
  }

  /**
   * 指定节点的所有邻居（前驱 + 后继）。
   *
   * @remarks 等价于 `Array.from(neighbors(nodeId))`。**自环节点会出现 2 次**（一次作为 pred,
   *   一次作为 succ），与 {@link incident} 的"自环只 1 次"语义不同 — 一个是端点序列，
   *   一个是边集去重。如需唯一邻居集合，自行用 `new Set(adjacencies(id))`。
   *
   * @param nodeId 节点 ID
   * @returns 节点 ID 数组
   */
  public adjacencies(nodeId: NodeId): NodeId[] {
    return Array.from(this.neighbors(nodeId));
  }

  /**
   * 入度：流入指定节点的边数。
   *
   * @remarks 直接对节点的所有输入端口求和，O(num_inputs)。
   * @param nodeId 节点 ID
   * @returns 入度
   */
  public inDegree(nodeId: NodeId): number {
    return this._degree(nodeId, 'input');
  }

  /**
   * 出度：流出指定节点的边数。
   *
   * @remarks 直接对节点的所有输出端口求和，O(num_outputs)。
   * @param nodeId 节点 ID
   * @returns 出度
   */
  public outDegree(nodeId: NodeId): number {
    return this._degree(nodeId, 'output');
  }

  /**
   * 总度数：入度 + 出度。
   *
   * @param nodeId 节点 ID
   * @returns 总度数
   */
  public degree(nodeId: NodeId): number {
    return this.inDegree(nodeId) + this.outDegree(nodeId);
  }

  /**
   * 节点在指定方向上的度数（端口边列表长度之和）。
   *
   * @internal
   */
  private _degree(nodeId: NodeId, direction: Direction): number {
    const node = this.nodes.get(nodeId);
    if (!node) return 0;
    const ports = direction === 'input' ? node.inputs : node.outputs;
    let count = 0;
    for (const key in ports) {
      const port = ports[key];
      if (port) count += port.edges.length;
    }
    return count;
  }

  // #endregion

  // #region Neighbors / IntoEdges trait 实现

  /**
   * {@inheritDoc Neighbors.neighbors}
   *
   * @remarks
   * - `direction='input'`：仅前驱（{@link upstream}）；
   * - `direction='output'`：仅后继（{@link downstream}）；
   * - 省略：流入邻居 + 流出邻居，**自环节点会出现 2 次**（端点序列语义）。
   */
  public *neighbors(nodeId: NodeId, direction?: Direction): Iterable<NodeId> {
    if (direction === 'input') {
      yield* this.upstream(nodeId);
      return;
    }
    if (direction === 'output') {
      yield* this.downstream(nodeId);
      return;
    }
    yield* this.upstream(nodeId);
    yield* this.downstream(nodeId);
  }

  /**
   * {@inheritDoc Neighbors.upstream}
   *
   * @remarks lazy generator；不构造中间数组。
   */
  public *upstream(nodeId: NodeId): Iterable<NodeId> {
    for (const edge of this._edgesOf(nodeId, 'input')) yield edge.sourceId;
  }

  /**
   * {@inheritDoc Neighbors.downstream}
   *
   * @remarks lazy generator；不构造中间数组。
   */
  public *downstream(nodeId: NodeId): Iterable<NodeId> {
    for (const edge of this._edgesOf(nodeId, 'output')) yield edge.targetId;
  }

  /** {@inheritDoc IntoEdges.getEdges} */
  public *getEdges(): Iterable<EdgeView<E>> {
    for (const edge of this.edges.values()) yield viewOf(edge);
  }

  /** {@inheritDoc IntoEdges.getIncoming} */
  public *getIncoming(nodeId: NodeId): Iterable<EdgeView<E>> {
    for (const edge of this._edgesOf(nodeId, 'input')) yield viewOf(edge);
  }

  /** {@inheritDoc IntoEdges.getOutgoing} */
  public *getOutgoing(nodeId: NodeId): Iterable<EdgeView<E>> {
    for (const edge of this._edgesOf(nodeId, 'output')) yield viewOf(edge);
  }

  // #endregion

  // #region 序列化

  /**
   * 序列化为可用 `JSON.stringify` 输出的纯对象快照。
   *
   * @returns 描述当前图的 {@link GraphJson} 结构
   */
  public toJson(): GraphJson<N, E> {
    const nodes: JsonNode<N>[] = [];
    for (const node of this.nodes.values()) {
      nodes.push({
        id: node.id,
        weight: node.weight,
        inputs: portsJson(node.inputs),
        outputs: portsJson(node.outputs),
      });
    }
    const edges: JsonEdge<E>[] = [];
    for (const edge of this.edges.values()) {
      edges.push({
        id: edge.id,
        source: { nodeId: edge.source.nodeId, portId: edge.source.portId },
        target: { nodeId: edge.target.nodeId, portId: edge.target.portId },
        weight: edge.weight,
      });
    }
    return { id: this.id, nodes, edges };
  }

  // #endregion
}

/**
 * 把内部 {@link Edge} 实例投影为通用 {@link EdgeView}。
 *
 * @internal
 */
function viewOf<E>(edge: Edge<E>): EdgeView<E> {
  return {
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    weight: edge.weight,
  };
}
