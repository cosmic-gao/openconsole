import { Invalid, Oneway, Oversized, Schema, Stale } from "./error";
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

/**
 * 一个方向的 CSR 邻接。三条数组绑在一个对象里，因此"有没有入向"是一次判断，
 * 而不是三个各自可空的字段。
 */
export interface Adjacency {
  /** 长度 `order+1`；节点 `u` 的邻接槽区间是 `[offset[u], offset[u+1])`。 */
  readonly offset: Ints;
  /** 槽 → 对端节点索引：出向里是目标，入向里是来源。 */
  readonly other: Ints;
  /** 槽 → 边序号，用于查 {@link Structure.weight}。 */
  readonly edge: Ints;
}

/**
 * **算法的输入契约**：索引空间的邻接读取，五个只读字段，全是纯数据。
 *
 * 算法一律面向这个接口而不是 {@link Snapshot} 类，因此凡是能凑出这五个字段的东西都能
 * 直接跑全套算法——SharedArrayBuffer 背书的邻接、WASM 里导出的 CSR、按规则生成而非
 * 存储的图、别的库编译出的结果，都不必先塞进 `Graph` 再编译一遍。
 *
 * @example 手写一条 3 节点链，不经过 Graph
 * ```ts
 * const chain: Structure = {
 *   order: 3,
 *   size: 2,
 *   outbound: { offset: Int32Array.of(0, 1, 2, 2), other: Int32Array.of(1, 2), edge: Int32Array.of(0, 1) },
 *   inbound: { offset: Int32Array.of(0, 0, 1, 2), other: Int32Array.of(0, 1), edge: Int32Array.of(0, 1) },
 *   weight: Float64Array.of(3, 4),
 * };
 * settle(toposort(chain)); // Int32Array [0, 1, 2]
 * ```
 */
export interface Structure {
  readonly order: number;
  readonly size: number;
  readonly outbound: Adjacency;
  /** 没有入向邻接时为 `undefined`；与 `outbound` 同一个对象则表示按无向编译。 */
  readonly inbound: Adjacency | undefined;
  /** 边序号 → 权重；`undefined` 表示无权，全部边按 1 计。 */
  readonly weight: Reals | undefined;
}

/** 边序号对应的代价；未编译权重时恒为 1。热循环里请把 `weight` 提到循环外直读。 */
export const costOf = (structure: Structure, edge: number): number =>
  structure.weight ? structure.weight[edge]! : 1;

/** 入向与出向是同一份邻接（无向编译），把它当无向图看时无需再扫反向。 */
export const merged = (structure: Structure): boolean =>
  structure.inbound === structure.outbound;

/**
 * 取入向邻接，缺失即报错——凡是真需要反向邻接的入口都先过这道关，别各自静默降级。
 *
 * @throws {@link Oneway} 结构只编了出向
 */
export function inboundOf(structure: Structure, caller: string): Adjacency {
  const found = structure.inbound;
  if (!found) throw new Oneway(caller);
  return found;
}

/**
 * 方向翻转的视图，O(1)：底层数组全部共享，只是把出向与入向对调。
 *
 * @throws {@link Oneway} 没有入向邻接
 */
export function reversed(structure: Structure): Structure {
  const back = inboundOf(structure, "reversed");
  return {
    order: structure.order,
    size: structure.size,
    outbound: back,
    inbound: structure.outbound,
    weight: structure.weight,
  };
}

/** 稠密结构的默认内存上限：512MB。 */
export const CEILING = 512 * 1024 * 1024;

export interface DenseOptions {
  /** O(V²) 分配的字节上限，默认 {@link CEILING}；超出抛 {@link Oversized}。 */
  limit?: number;
}

/**
 * 稠密分配前的规模闸门。
 *
 * @throws {@link Oversized} 超过 `limit`
 */
export function afford(bytes: number, limit: number, what: string): void {
  if (bytes > limit) throw new Oversized(bytes, limit, what);
}

export const outDegree = (structure: Structure, u: number): number =>
  structure.outbound.offset[u + 1]! - structure.outbound.offset[u]!;

/** 缺入向邻接时恒为 0；需要报错而非降级的场合用 {@link inboundOf}。 */
export const inDegree = (structure: Structure, u: number): number => {
  const inbound = structure.inbound;
  return inbound ? inbound.offset[u + 1]! - inbound.offset[u]! : 0;
};

export interface CompileOptions<N = unknown, E = unknown> {
  /** 只保留满足谓词的节点。 */
  node?: (node: NodeId, weight: N | undefined) => boolean;
  /** 只保留满足谓词的边；两端节点也必须保留。 */
  edge?: (edge: EdgeRecord<E>) => boolean;
  /** 把这些分组各折叠成单节点：其后代不再单独出现，跨组边聚合到组上、组内边消失。 */
  collapse?: Iterable<NodeId>;
  /**
   * 边权，只吃边自己的权重值。省略则不编译权重，最短路类算法将无法运行。
   *
   * @remarks 签名不给整条 {@link EdgeRecord}，是为了让增量重编译只依赖权重值——
   *   结构没变时重算全部边权就是一遍纯下标扫描。要按端点算权就把它烘进 `E` 里。
   */
  weight?: (weight: E | undefined) => number;
  /** 视作无向：每条边在两端各出现一次。 */
  undirected?: boolean;
  /** 只编译出边方向，省掉一半内存与编译时间；{@link Snapshot.reverse} 与入向遍历将不可用。 */
  outbound?: boolean;
  /** 平行边合并为一条：权重两两经此函数聚合（如 `Math.min`），边 id 取首条。 */
  merge?: (a: number, b: number) => number;
  /** CSR 与权重分配在 `SharedArrayBuffer` 上，多个 Worker 可零拷贝共享；标签层不受影响。 */
  shared?: boolean;
  /**
   * 上一份快照。结构自它编译以来没变过就地复用 CSR，只重算边权；图与 `weight` 回调
   * 引用都没变则原样返回。编译选项不一致或用了谓词 / 折叠 / 合并时自动退回全量编译，
   * 因此传错不会出错，只是没有加速。
   */
  reuse?: Snapshot;
}

/** 快照的纯数据形态：只含 typed-array 与字符串数组，可结构化克隆或 transfer 给 Worker。 */
export interface SnapshotData {
  readonly graph: GraphId;
  readonly revision: number;
  readonly order: number;
  readonly size: number;
  /** 索引 → 节点 id；按 {@link Snapshot.core} 搬运时缺省。 */
  readonly labels?: ReadonlyArray<NodeId> | undefined;
  /** 边序号 → 边 id；按 {@link Snapshot.core} 搬运时缺省。 */
  readonly edges?: ReadonlyArray<EdgeId> | undefined;
  readonly outbound: Adjacency;
  readonly inbound?: Adjacency | undefined;
  /** 边序号 → 权重。正反向共享一份。 */
  readonly weight?: Reals | undefined;
}

const UNLABELED: ReadonlyArray<never> = [];

/** id → 索引表的惰性容器；`reverse` 与增量重编译共享同一个，避免重复建表。 */
interface Lookup {
  map?: ReadonlyMap<NodeId, number>;
}

/** 编译选项的指纹。整组一致才谈得上复用，因此作为一个值传递与比对。 */
interface Recipe {
  /** 没用谓词、折叠或合并——只有这种编译的结构才由 `shape` 完全决定。 */
  readonly plain: boolean;
  readonly undirected: boolean;
  readonly outbound: boolean;
  readonly shared: boolean;
  /** 编译时的 `weight` 回调。引用变了说明语义可能已变，权重必须重算。 */
  readonly weigh: unknown;
}

/** 编译来源：配方指纹之上再记下是从哪张图的哪个版本编出来的。 */
interface Source extends Recipe {
  /**
   * 弱引用：快照可能活得比源图久（缓存在算法层、挂在 UI 状态上），强引用会把整张图连同
   * 全部端口对象一起钉住——快照自身可能只有几百 KB，钉住的图却是它的几十倍。
   */
  readonly graph: WeakRef<{
    readonly revision: number;
    readonly shape: number;
  }>;
  /** 编译时的 `graph.shape`。 */
  readonly shape: number;
  /** 出入向已被 {@link Snapshot.reverse} 对调过；这样的快照不能再拿去复用。 */
  readonly flipped: boolean;
  /** CSR 边序号 → 图内边槽位。结构不变时槽位不动，据此可零哈希地重算边权。 */
  readonly slots: Int32Array;
}

/**
 * 不可变的图快照：CSR 邻接，全部数据在 typed-array 里，实现 {@link Structure}。
 *
 * 算法只吃 `Structure`，不吃 {@link Graph}——输入不可变意味着长跑任务中断后恢复时不会
 * 读到半改的图，也意味着快照能整份搬到 Worker 里跑。过滤、折叠、无向化都在编译期一次完成，
 * 因此运行期没有任何谓词回调或视图转发的开销。
 *
 * 这个类在 `Structure` 之上多出的只有**标签层**：索引 ↔ {@link NodeId} 的互查。
 * 算法产出的是索引，需要名字时在边界上用 {@link Snapshot.names} 换。
 */
export class Snapshot implements Structure {
  public readonly graph: GraphId;
  public readonly revision: number;
  public readonly order: number;
  public readonly size: number;
  /** 按 {@link Snapshot.core} 搬运过来的快照没有标签层，这里是空数组。 */
  public readonly labels: ReadonlyArray<NodeId>;
  public readonly edges: ReadonlyArray<EdgeId>;
  public readonly outbound: Adjacency;
  public readonly inbound: Adjacency | undefined;
  public readonly weight: Reals | undefined;

  /** 建表是惰性的：只跑索引空间算法的消费者（尤其是 Worker 侧）一次哈希都不用付。 */
  private readonly _lookup: Lookup;
  private readonly _source: Source | undefined;

  private constructor(data: SnapshotData, source?: Source, lookup?: Lookup) {
    this.graph = data.graph;
    this.revision = data.revision;
    this.order = data.order;
    this.size = data.size;
    this.labels = data.labels ?? UNLABELED;
    this.edges = data.edges ?? UNLABELED;
    this.outbound = data.outbound;
    this.inbound = data.inbound;
    this.weight = data.weight;
    this._lookup = lookup ?? {};
    this._source = source;
  }

  public indexOf(node: NodeId): number {
    const lookup = this._lookup;
    const map = (lookup.map ??= locate(this.labels));
    return map.get(node) ?? -1;
  }

  /** 外部查询用：越界返回 `undefined`。 */
  public at(index: number): NodeId | undefined {
    return this.labels[index];
  }

  /**
   * 内部遍历用：索引来自 `0 .. order-1`，越界属于程序错误而非查询失败。
   * 把这个不变量收在一处，调用点就不必到处写非空断言。
   */
  public label(index: number): NodeId {
    const found = this.labels[index];
    if (found === undefined) {
      throw new RangeError(
        this.labels.length === 0 && this.order > 0
          ? "snapshot was transferred without labels; send `data` instead of `core`"
          : `node index ${index} is out of range`,
      );
    }
    return found;
  }

  /** 批量把索引换成名字——算法产出与人看的东西之间的那道边界。 */
  public names(indices: Iterable<number>): NodeId[] {
    const found: NodeId[] = [];
    for (const index of indices) found.push(this.label(index));
    return found;
  }

  /**
   * 只含 CSR 与权重的搬运形态，不带标签层。
   *
   * @remarks 标签是字符串数组，结构化克隆时只能逐个深拷贝——V=5 万的快照里它占掉整份
   *   `data` 克隆耗时的九成（21ms → 1.9ms），而只跑索引空间算法的 Worker 侧根本用不到它。
   *   这样还原出来的快照 `at` / `indexOf` 查不到东西，`label` / `names` 明确报错。
   */
  public get core(): SnapshotData {
    return {
      graph: this.graph,
      revision: this.revision,
      order: this.order,
      size: this.size,
      outbound: this.outbound,
      inbound: this.inbound,
      weight: this.weight,
    };
  }

  /** 交给 `postMessage` 的纯数据；`Snapshot.from` 可在另一线程还原。 */
  public get data(): SnapshotData {
    // 按 core 还原的快照没有标签层。空数组要还原成"缺省"而不是原样带上，
    // 否则中转 Worker 转发它的 data 时会被 `Snapshot.from` 判作"0 个标签对 N 个节点"。
    return {
      ...this.core,
      labels: this.labels === UNLABELED ? undefined : this.labels,
      edges: this.edges === UNLABELED ? undefined : this.edges,
    };
  }

  /**
   * 方向翻转，O(1)：底层数组与索引表全部共享，只是把出向与入向对调。
   *
   * @throws {@link Oneway} 编译时用了 `outbound` 因而没有入向邻接
   */
  public reverse(): Snapshot {
    const back = inboundOf(this, "Snapshot.reverse");
    const source = this._source;
    return new Snapshot(
      { ...this.data, outbound: back, inbound: this.outbound },
      source && { ...source, flipped: !source.flipped },
      this._lookup,
    );
  }

  /**
   * 源图自编译以来是否未再变更。跨线程还原的快照没有源图，源图已被回收时也无从判定，
   * 两种情况都恒为 `true`——陈旧只在**证据确凿**时才报。
   */
  public get current(): boolean {
    const source = this._source?.graph.deref();
    return source === undefined || source.revision === this.revision;
  }

  /** @throws {@link Stale} 源图已变更 */
  public verify(): this {
    const source = this._source?.graph.deref();
    if (source && source.revision !== this.revision) {
      throw new Stale(this.revision, source.revision);
    }
    return this;
  }

  /** @throws {@link Schema} 字段长度相互矛盾（截断或错位的搬运数据） */
  public static from(data: SnapshotData): Snapshot {
    conform(data);
    return new Snapshot(data);
  }

  public static of<N, E>(
    graph: Graph<N, E>,
    options: CompileOptions<N, E> = {},
  ): Snapshot {
    const collapse = options.collapse ? [...options.collapse] : [];
    const recipe: Recipe = {
      plain:
        options.node === undefined &&
        options.edge === undefined &&
        options.merge === undefined &&
        collapse.length === 0,
      undirected: options.undirected === true,
      outbound: options.outbound === true,
      shared: options.shared === true,
      weigh: options.weight,
    };

    const recycled = options.reuse?._recycle(graph, recipe, options.weight);
    if (recycled) return recycled;

    const { undirected, shared } = recipe;

    const represent = folding(graph, collapse);
    const place = new Int32Array(graph.bound).fill(-1);
    const labels: NodeId[] = [];
    graph.forEachNode((id, weight, slot) => {
      if (represent(slot) !== slot) return;
      if (options.node?.(id, weight) === false) return;
      place[slot] = labels.length;
      labels.push(id);
    });

    const capacity = graph.size;
    const tail = new Int32Array(capacity);
    const head = new Int32Array(capacity);
    const slots = new Int32Array(capacity);
    const keep = options.edge;
    let count = 0;

    graph.forEachLink((e, from, to) => {
      const source = represent(from);
      const target = represent(to);
      const u = place[source]!;
      const v = place[target]!;
      if (u < 0 || v < 0) return;
      // 组内边随折叠一起消失；未被折叠的真自环保留。
      if (u === v && (source !== from || target !== to)) return;
      if (keep !== undefined && keep(graph.edgeAt(e)!) === false) return;
      tail[count] = u;
      head[count] = v;
      slots[count] = e;
      count++;
    });

    const order = labels.length;
    let weight = measure(graph, slots, count, options.weight, shared);
    if (options.merge !== undefined) {
      count = coalesce(
        tail,
        head,
        slots,
        count,
        order,
        undirected,
        weight,
        options.merge,
      );
      if (weight !== undefined) {
        // 聚合能从有限值造出 NaN（如 Infinity 相消），与 measure 同一道关，在源头拦。
        for (let i = 0; i < count; i++) {
          if (Number.isNaN(weight[i])) {
            throw new Invalid(graph.edgeIdAt(slots[i]!)!);
          }
        }
        // 合并后长度缩水，裁一份紧的，快照不拖超配的尾巴。
        const packed = reals(count, shared);
        packed.set(weight.subarray(0, count));
        weight = packed;
      }
    }

    const edges: EdgeId[] = new Array(count);
    for (let i = 0; i < count; i++) edges[i] = graph.edgeIdAt(slots[i]!)!;

    const outbound = adjacency(order, tail, head, count, undirected, shared);
    const inbound = recipe.outbound
      ? undefined
      : undirected
        ? outbound
        : adjacency(order, head, tail, count, false, shared);

    return new Snapshot(
      {
        graph: graph.id,
        revision: graph.revision,
        order,
        size: count,
        labels,
        edges,
        outbound,
        inbound,
        weight,
      },
      {
        ...recipe,
        graph: new WeakRef(graph),
        shape: graph.shape,
        flipped: false,
        slots: slots.slice(0, count),
      },
    );
  }

  /**
   * 增量重编译：结构没变就复用 CSR，只重算边权；连权重都没变则原样返回自己。
   *
   * @returns 不满足复用条件时返回 `undefined`，由调用方走全量编译
   */
  private _recycle<N, E>(
    graph: Graph<N, E>,
    recipe: Recipe,
    weight: ((weight: E | undefined) => number) | undefined,
  ): Snapshot | undefined {
    const source = this._source;
    if (source === undefined) return undefined;
    // 源图已回收时 deref 给 undefined，同样不等于 graph，因此一并落到"不复用"。
    if (source.graph.deref() !== graph) return undefined;
    // 翻转过的快照方向与编译选项对不上，复用它会静默给出反向结构。
    if (source.flipped) return undefined;
    // 带谓词、折叠或合并时，结构不只由 shape 决定（谓词可能看权重），一律全量重来。
    if (!source.plain || !recipe.plain) return undefined;
    if (source.undirected !== recipe.undirected) return undefined;
    if (source.outbound !== recipe.outbound) return undefined;
    if (source.shared !== recipe.shared) return undefined;
    if (source.shape !== graph.shape) return undefined;

    if (graph.revision === this.revision && weight === source.weigh) {
      return this;
    }
    const slots = source.slots;
    return new Snapshot(
      {
        graph: this.graph,
        revision: graph.revision,
        order: this.order,
        size: this.size,
        labels: this.labels,
        edges: this.edges,
        outbound: this.outbound,
        inbound: this.inbound,
        weight: measure(graph, slots, slots.length, weight, source.shared),
      },
      { ...source, shape: graph.shape, weigh: weight },
      this._lookup,
    );
  }
}

function ints(length: number, shared: boolean): Int32Array {
  return shared
    ? new Int32Array(new SharedArrayBuffer(4 * length))
    : new Int32Array(length);
}

function reals(length: number, shared: boolean): Float64Array {
  return shared
    ? new Float64Array(new SharedArrayBuffer(8 * length))
    : new Float64Array(length);
}

/** @throws {@link Invalid} `weight` 回调给出了 `NaN` */
function measure<N, E>(
  graph: Graph<N, E>,
  slots: Int32Array,
  count: number,
  weight: ((weight: E | undefined) => number) | undefined,
  shared: boolean,
): Float64Array | undefined {
  if (weight === undefined) return undefined;
  const costs = reals(count, shared);
  for (let i = 0; i < count; i++) {
    const slot = slots[i]!;
    const cost = weight(graph.edgeWeightAt(slot));
    // 在这里拦，报得出边 id；漏到算法里就只剩一个静默的"不可达"。
    if (Number.isNaN(cost)) throw new Invalid(graph.edgeIdAt(slot)!);
    costs[i] = cost;
  }
  return costs;
}

/** 平行边就地去重：首条留位，其余的权重经 `merge` 折进首条；返回合并后的边数。 */
function coalesce(
  tail: Int32Array,
  head: Int32Array,
  slots: Int32Array,
  count: number,
  order: number,
  undirected: boolean,
  weight: Float64Array | undefined,
  merge: (a: number, b: number) => number,
): number {
  const seen = new Map<number, number>();
  let kept = 0;
  for (let i = 0; i < count; i++) {
    let u = tail[i]!;
    let v = head[i]!;
    if (undirected && v < u) {
      const flip = u;
      u = v;
      v = flip;
    }
    // order < 2²⁶ 时 u·order+v 不超过 2⁵³，键精确；标签层远在那个规模之前就会
    // 先耗尽内存，故不为这个理论上限付分桶或字符串键的开销。
    const key = u * order + v;
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, kept);
      tail[kept] = tail[i]!;
      head[kept] = head[i]!;
      slots[kept] = slots[i]!;
      if (weight !== undefined) weight[kept] = weight[i]!;
      kept++;
    } else if (weight !== undefined) {
      weight[at] = merge(weight[at]!, weight[i]!);
    }
  }
  return kept;
}

/** @throws {@link Schema} 字段长度相互矛盾 */
function conform(data: SnapshotData): void {
  const { order, size, labels, edges, weight } = data;
  fit(data.outbound, order, "outbound");
  const inbound = data.inbound;
  if (inbound !== undefined && inbound !== data.outbound) {
    fit(inbound, order, "inbound");
  }
  if (weight !== undefined && weight.length !== size) {
    throw new Schema(`weight has ${weight.length} entries for ${size} edges`);
  }
  if (labels !== undefined && labels.length !== order) {
    throw new Schema(`${labels.length} labels for ${order} nodes`);
  }
  if (edges !== undefined && edges.length !== size) {
    throw new Schema(`${edges.length} edge ids for ${size} edges`);
  }
}

function fit(adjacency: Adjacency, order: number, side: string): void {
  const { offset, other, edge } = adjacency;
  if (offset.length !== order + 1) {
    throw new Schema(
      `${side} offset has ${offset.length} entries for ${order} nodes`,
    );
  }
  if (other.length !== edge.length || offset[order] !== other.length) {
    throw new Schema(
      `${side} lists ${other.length} slots but offset ends at ${offset[order]}`,
    );
  }
}

function locate(labels: ReadonlyArray<NodeId>): ReadonlyMap<NodeId, number> {
  const index = new Map<NodeId, number>();
  for (let i = 0; i < labels.length; i++) index.set(labels[i]!, i);
  return index;
}

/**
 * 按 `tail → head` 建 CSR；`both` 为真时每条边在两端各出现一次。
 *
 * @remarks 计数与落位刻意写成裸循环而不是抽小函数：这两步是整个编译里最贵的单项，
 *   一旦包成捕获四个数组的闭包就拿不到内联。
 */
function adjacency(
  order: number,
  tail: Int32Array,
  head: Int32Array,
  count: number,
  both: boolean,
  shared: boolean,
): Adjacency {
  const offset = ints(order + 1, shared);
  for (let e = 0; e < count; e++) {
    const t = tail[e]!;
    offset[t + 1] = offset[t + 1]! + 1;
    const h = head[e]!;
    if (both && h !== t) offset[h + 1] = offset[h + 1]! + 1;
  }
  for (let u = 0; u < order; u++) offset[u + 1] = offset[u + 1]! + offset[u]!;

  const other = ints(offset[order]!, shared);
  const edge = ints(offset[order]!, shared);
  const cursor = Int32Array.from(offset.subarray(0, order));
  for (let e = 0; e < count; e++) {
    const t = tail[e]!;
    const h = head[e]!;
    let slot = cursor[t]!;
    cursor[t] = slot + 1;
    other[slot] = h;
    edge[slot] = e;
    if (both && h !== t) {
      slot = cursor[h]!;
      cursor[h] = slot + 1;
      other[slot] = t;
      edge[slot] = e;
    }
  }
  return { offset, other, edge };
}

/** 节点槽位 → 代表节点槽位：祖先中最外层的被折叠分组，没有则是自身。 */
function folding<N, E>(
  graph: Graph<N, E>,
  groups: ReadonlyArray<NodeId>,
): (slot: number) => number {
  if (groups.length === 0) return (slot) => slot;
  const collapsed = new Set<number>();
  for (const id of groups) {
    const u = graph.indexOf(id);
    if (u >= 0) collapsed.add(u);
  }
  if (collapsed.size === 0) return (slot) => slot;

  const cache = new Int32Array(graph.bound).fill(-1);
  return (slot: number): number => {
    const known = cache[slot]!;
    if (known >= 0) return known;
    let representative = slot;
    for (
      let cursor = graph.parentAt(slot);
      cursor !== -1;
      cursor = graph.parentAt(cursor)
    ) {
      if (collapsed.has(cursor)) representative = cursor;
    }
    cache[slot] = representative;
    return representative;
  };
}
