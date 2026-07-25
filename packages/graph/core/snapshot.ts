import { Stale } from "./error";
import type { EdgeRecord, Graph } from "./graph";
import type { EdgeId, GraphId, NodeId } from "./ident";

/**
 * 只读整数数组：索引与迭代照常，但没有任何写入口。快照宣称不可变，
 * 这个类型让"不可变"在编译期就成立，而不是只写在文档里。
 */
export interface Ints extends Iterable<number> {
  readonly length: number;
  readonly [index: number]: number;
  subarray(begin?: number, end?: number): Ints;
}

/** 只读浮点数组，语义同 {@link Ints}。 */
export interface Reals extends Iterable<number> {
  readonly length: number;
  readonly [index: number]: number;
}

export interface CompileOptions<N = unknown, E = unknown> {
  /** 只保留满足谓词的节点。 */
  node?: (node: NodeId, weight: N | undefined) => boolean;
  /** 只保留满足谓词的边；两端节点也必须保留。 */
  edge?: (edge: EdgeRecord<E>) => boolean;
  /** 把这些分组各折叠成单节点：其后代不再单独出现，跨组边聚合到组上、组内边消失。 */
  collapse?: Iterable<NodeId>;
  /** 边权。省略则不编译权重，最短路类算法将无法运行。 */
  weight?: (edge: EdgeRecord<E>) => number;
  /** 视作无向：每条边在两端各出现一次。 */
  undirected?: boolean;
  /** 只编译出边方向，省掉一半内存与编译时间；{@link Snapshot.reverse} 与入向遍历将不可用。 */
  outbound?: boolean;
}

/**
 * 一个方向的 CSR 邻接。三条数组绑在一个对象里，因此"有没有入向"是一次判断，
 * 而不是三个各自可空的字段。
 */
export interface Adjacency {
  /** 长度 `order+1`；节点 `u` 的邻接槽区间是 `[offset[u], offset[u+1])`。 */
  readonly offset: Ints;
  /** 槽 → 对端节点索引：出向里是目标，入向里是来源。 */
  readonly other: Ints;
  /** 槽 → 边序号，用于查 {@link SnapshotData.weight} 与 {@link SnapshotData.edges}。 */
  readonly edge: Ints;
}

/** 快照的纯数据形态：只含 typed-array 与字符串数组，可结构化克隆或 transfer 给 Worker。 */
export interface SnapshotData {
  readonly graph: GraphId;
  readonly revision: number;
  readonly labels: ReadonlyArray<NodeId>;
  readonly edges: ReadonlyArray<EdgeId>;
  readonly outbound: Adjacency;
  readonly inbound?: Adjacency | undefined;
  /** 边序号 → 权重。正反向共享一份。 */
  readonly weight?: Reals | undefined;
}

/**
 * 不可变的图快照：CSR 邻接，全部数据在 typed-array 里。
 *
 * 算法只吃快照，不吃 {@link Graph}——输入不可变意味着长跑任务中断后恢复时不会读到半改的图，
 * 也意味着快照能整份搬到 Worker 里跑。过滤、折叠、无向化都在编译期一次完成，
 * 因此运行期没有任何谓词回调或视图转发的开销。
 */
export class Snapshot {
  public readonly graph: GraphId;
  public readonly revision: number;
  public readonly labels: ReadonlyArray<NodeId>;
  public readonly edges: ReadonlyArray<EdgeId>;
  public readonly outbound: Adjacency;
  public readonly inbound: Adjacency | undefined;
  public readonly weight: Reals | undefined;

  private readonly _index: Map<NodeId, number>;
  /** 只留一个读版本号的窗口，免得快照顺带持有整张图的泛型。 */
  private readonly _origin: { readonly revision: number } | undefined;

  private constructor(
    data: SnapshotData,
    origin?: { readonly revision: number },
  ) {
    this.graph = data.graph;
    this.revision = data.revision;
    this.labels = data.labels;
    this.edges = data.edges;
    this.outbound = data.outbound;
    this.inbound = data.inbound;
    this.weight = data.weight;
    this._index = new Map(data.labels.map((id, i) => [id, i]));
    this._origin = origin;
  }

  public get order(): number {
    return this.labels.length;
  }

  public get size(): number {
    return this.edges.length;
  }

  public indexOf(node: NodeId): number {
    return this._index.get(node) ?? -1;
  }

  /** 外部查询用：越界返回 `undefined`。 */
  public at(index: number): NodeId | undefined {
    return this.labels[index];
  }

  /**
   * 内部遍历用：索引来自 `0 .. order-1`，越界属于程序错误而非查询失败。
   * 把这个不变量收在一处，算法里就不必到处写非空断言。
   */
  public label(index: number): NodeId {
    const found = this.labels[index];
    if (found === undefined) {
      throw new RangeError(`node index ${index} is out of range`);
    }
    return found;
  }

  public outDegree(u: number): number {
    return this.outbound.offset[u + 1]! - this.outbound.offset[u]!;
  }

  /** 没有入向邻接时恒为 0。 */
  public inDegree(u: number): number {
    const inbound = this.inbound;
    return inbound ? inbound.offset[u + 1]! - inbound.offset[u]! : 0;
  }

  /** 边序号对应的权重；未编译权重时为 1，无权算法因此能复用同一套代码。 */
  public costAt(edge: number): number {
    return this.weight ? this.weight[edge]! : 1;
  }

  /** 入向与出向是同一份邻接（无向编译），把它当无向图看时无需再扫反向。 */
  public get merged(): boolean {
    return this.inbound === this.outbound;
  }

  /** 交给 `postMessage` 的纯数据；`Snapshot.from` 可在另一线程还原。 */
  public get data(): SnapshotData {
    return {
      graph: this.graph,
      revision: this.revision,
      labels: this.labels,
      edges: this.edges,
      outbound: this.outbound,
      inbound: this.inbound,
      weight: this.weight,
    };
  }

  /**
   * 方向翻转，O(1)：与原快照共享全部底层数组，只是把出向与入向对调。
   *
   * @throws Error 编译时用了 `outbound` 因而没有入向邻接
   */
  public reverse(): Snapshot {
    const inbound = this.inbound;
    if (!inbound) {
      throw new Error(
        "snapshot has no inbound adjacency; compile without `outbound`",
      );
    }
    return new Snapshot(
      { ...this.data, outbound: inbound, inbound: this.outbound },
      this._origin,
    );
  }

  /** 源图自编译以来是否未再变更。跨线程还原的快照没有源图，恒为 `true`。 */
  public get current(): boolean {
    return (
      this._origin === undefined || this._origin.revision === this.revision
    );
  }

  /** @throws {@link Stale} 源图已变更 */
  public verify(): this {
    const origin = this._origin;
    if (origin && origin.revision !== this.revision) {
      throw new Stale(this.revision, origin.revision);
    }
    return this;
  }

  public static from(data: SnapshotData): Snapshot {
    return new Snapshot(data);
  }

  public static of<N, E>(
    graph: Graph<N, E>,
    options: CompileOptions<N, E> = {},
  ): Snapshot {
    const represent = folding((node) => graph.parent(node), options.collapse);
    const labels: NodeId[] = [];
    const index = new Map<NodeId, number>();

    graph.forEachNode((id, weight) => {
      if (represent(id) !== id) return;
      if (options.node?.(id, weight) === false) return;
      index.set(id, labels.length);
      labels.push(id);
    });

    const edges: EdgeId[] = [];
    const tail: number[] = [];
    const head: number[] = [];
    const costs: number[] = [];

    graph.forEachEdge((record) => {
      const source = represent(record.source);
      const target = represent(record.target);
      const u = index.get(source);
      const v = index.get(target);
      if (u === undefined || v === undefined) return;
      // 组内边随折叠一起消失；未被折叠的真自环保留。
      if (u === v && (source !== record.source || target !== record.target)) {
        return;
      }
      if (options.edge?.(record) === false) return;
      tail.push(u);
      head.push(v);
      edges.push(record.id);
      if (options.weight) costs.push(options.weight(record));
    });

    const order = labels.length;
    const undirected = options.undirected === true;
    const outbound = adjacency(order, tail, head, undirected);
    const inbound =
      options.outbound === true
        ? undefined
        : undirected
          ? outbound
          : adjacency(order, head, tail, false);

    return new Snapshot(
      {
        graph: graph.id,
        revision: graph.revision,
        labels,
        edges,
        outbound,
        inbound,
        weight: options.weight ? Float64Array.from(costs) : undefined,
      },
      graph,
    );
  }
}

/** 按 `tail → head` 建 CSR；`both` 为真时每条边在两端各出现一次。 */
function adjacency(
  order: number,
  tail: ReadonlyArray<number>,
  head: ReadonlyArray<number>,
  both: boolean,
): Adjacency {
  const offset = new Int32Array(order + 1);
  const count = (u: number): void => {
    offset[u + 1] = offset[u + 1]! + 1;
  };
  for (let e = 0; e < tail.length; e++) {
    count(tail[e]!);
    if (both && head[e] !== tail[e]) count(head[e]!);
  }
  for (let u = 0; u < order; u++) offset[u + 1] = offset[u + 1]! + offset[u]!;

  const total = offset[order]!;
  const other = new Int32Array(total);
  const edge = new Int32Array(total);
  const cursor = Int32Array.from(offset.subarray(0, order));

  const place = (from: number, to: number, e: number): void => {
    const slot = cursor[from]!;
    cursor[from] = slot + 1;
    other[slot] = to;
    edge[slot] = e;
  };
  for (let e = 0; e < tail.length; e++) {
    place(tail[e]!, head[e]!, e);
    if (both && head[e] !== tail[e]) place(head[e]!, tail[e]!, e);
  }
  return { offset, other, edge };
}

/** 节点 → 代表节点：祖先中最外层的被折叠分组，没有则是自身。 */
function folding(
  parent: (node: NodeId) => NodeId | undefined,
  groups: Iterable<NodeId> | undefined,
): (node: NodeId) => NodeId {
  if (!groups) return (node) => node;
  const collapsed = new Set(groups);
  if (collapsed.size === 0) return (node) => node;

  const cache = new Map<NodeId, NodeId>();
  return (node: NodeId): NodeId => {
    const known = cache.get(node);
    if (known !== undefined) return known;
    let representative = node;
    for (
      let cursor = parent(node);
      cursor !== undefined;
      cursor = parent(cursor)
    ) {
      if (collapsed.has(cursor)) representative = cursor;
    }
    cache.set(node, representative);
    return representative;
  };
}
