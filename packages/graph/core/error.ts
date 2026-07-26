import type { NodeId } from "./ident";

export type Code =
  | "duplicate"
  | "missing"
  | "cycle"
  | "socket"
  | "capacity"
  | "negative"
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
