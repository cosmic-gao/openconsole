import type { NodeId } from "./ident";

export type Code =
  | "duplicate"
  | "missing"
  | "cycle"
  | "oneway"
  | "socket"
  | "capacity"
  | "negative"
  | "invalid"
  | "oversized"
  | "schema"
  | "stale"
  | "incomplete"
  | "interrupted";

/** 所有图错误的基类，`code` 用于分类捕获，`name` 取实际子类名。 */
export class GraphError extends Error {
  public constructor(
    public readonly code: Code,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class Duplicate extends GraphError {
  public constructor(kind: "node" | "edge", id: string) {
    super("duplicate", `${kind} "${id}" already exists`);
  }
}

export class Missing extends GraphError {
  public constructor(
    kind: "node" | "edge" | "port",
    id: string,
    hint?: string,
  ) {
    super("missing", `${kind} "${id}" not found${hint ? ` (${hint})` : ""}`);
  }
}

/**
 * 算法在图里撞上了环。`nodes` 是**节点索引**——算法层不认识 id，需要可读名字时
 * 用 `snapshot.names(error.nodes)` 换。
 */
export class Cycle extends GraphError {
  public constructor(public readonly nodes: ReadonlyArray<number>) {
    super(
      "cycle",
      `cycle through ${nodes.length} node(s): #${nodes.slice(0, 8).join(" -> #")}`,
    );
  }
}

/** 层级会成环：把节点挂到自己的后代下面。层级是编辑层概念，故用 id 而非索引。 */
export class Nested extends GraphError {
  public constructor(
    public readonly node: NodeId,
    public readonly parent: NodeId,
  ) {
    super(
      "cycle",
      `"${node}" cannot be nested under its descendant "${parent}"`,
    );
  }
}

/**
 * 算法需要入向邻接，但结构是按 `outbound` 只编了出向的。
 *
 * @remarks 单独立一类而不是当成"没有入边"处理，因为缺入向时每个算法都会退化成一个
 *   看起来正常的答案：`sources` 把每个节点都算成源、`dominators` 退化成 DFS 树、
 *   `components` 按可达性而非弱连通分组、`prim` 与 `cuts` 漏掉整个分支。
 */
export class Oneway extends GraphError {
  public constructor(caller: string) {
    super(
      "oneway",
      `${caller} needs inbound adjacency; recompile without the \`outbound\` option`,
    );
  }
}

/** 源端口与目标端口的数据类型不兼容。 */
export class Mismatch extends GraphError {
  public constructor(source: string, target: string) {
    super("socket", `socket "${source}" cannot feed "${target}"`);
  }
}

/** 向声明了 `multiple: false` 的端口重复连边。 */
export class Capacity extends GraphError {
  public constructor(node: NodeId, port: string) {
    super("capacity", `port "${node}:${port}" accepts a single connection`);
  }
}

/** `edge` 是边序号（{@link Snapshot.edges} 的下标），不是 {@link EdgeId}。 */
export class Negative extends GraphError {
  public constructor(
    public readonly cost: number,
    public readonly edge: number,
  ) {
    super(
      "negative",
      `negative cost ${cost} on edge #${edge}; use bellmanFord`,
    );
  }
}

/**
 * 边权是 `NaN`。
 *
 * @remarks 单独立一类而不是放过去，因为 `NaN` 与任何值比较都是 `false`：不拦住的话
 *   最短路会把明明连通的节点静默报成不可达，且没有任何迹象可查。
 *
 *   `edge` 在编译期是 {@link EdgeId}，在算法里是边序号（{@link Snapshot.edges} 的下标）。
 */
export class Invalid extends GraphError {
  public constructor(public readonly edge: string | number) {
    super(
      "invalid",
      `NaN cost on edge ${edge}; it would silently read as unreachable`,
    );
  }
}

/**
 * 稠密结构（全源矩阵、可达位图）要的内存超过了上限。
 *
 * @remarks 这类分配是 O(V²)：`floydWarshall` 在 V=10000 上要 763MB、`closure` 的位图在
 *   V=100000 上要 1.2GB。不拦住就是一次静默的巨额申请，轻则拖垮进程、重则被 OOM 杀掉，
 *   而调用方往往只是没意识到自己的图有多大。抬 `limit` 即可放行。
 */
export class Oversized extends GraphError {
  public constructor(
    public readonly bytes: number,
    public readonly limit: number,
    what: string,
  ) {
    super(
      "oversized",
      `${what} needs ${megabytes(bytes)} of dense storage, over the ${megabytes(limit)} limit; raise \`limit\` if that is intended`,
    );
  }
}

const megabytes = (bytes: number): string =>
  `${(bytes / 1024 / 1024).toFixed(1)}MB`;

export class Schema extends GraphError {
  public constructor(got: unknown, expected: number) {
    super(
      "schema",
      `unsupported schema version ${String(got)} (expected ${expected})`,
    );
  }
}

/** 快照编译后图又发生了结构变更，快照已不代表当前图。 */
export class Stale extends GraphError {
  public constructor(compiled: number, current: number) {
    super(
      "stale",
      `snapshot taken at revision ${compiled}, graph is now at ${current}`,
    );
  }
}

/** 在任务跑完之前读取结果。 */
export class Incomplete extends GraphError {
  public constructor(progress: number) {
    super(
      "incomplete",
      `task is ${(progress * 100).toFixed(1)}% done; settle or schedule it first`,
    );
  }
}

/** 任务被 `AbortSignal` 中断；任务现场保留，可再次推进。 */
export class Interrupted extends GraphError {
  public constructor(public readonly progress: number) {
    super("interrupted", `task interrupted at ${(progress * 100).toFixed(1)}%`);
  }
}
