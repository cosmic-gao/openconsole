import type { EdgeId, NodeId, PortId } from "../types";

/** 图错误的分类码。 */
export type Code =
  | "duplicate"
  | "missing"
  | "cycle"
  | "socket"
  | "direction"
  | "capacity"
  | "attached"
  | "negative"
  | "schema";

/** 所有图相关错误的基类，携带分类码 {@link Code}。 */
export class GraphError extends Error {
  /** 错误分类码。 */
  public readonly code: Code;

  public constructor(code: Code, message: string) {
    super(message);
    this.name = "GraphError";
    this.code = code;
  }
}

/** 重复添加节点或边时抛出。 */
export class Duplicate extends GraphError {
  public constructor(kind: "node" | "edge", id: NodeId | EdgeId) {
    super("duplicate", `${kind} "${String(id)}" already exists`);
    this.name = "Duplicate";
  }
}

/** 引用了不存在的节点、边或端口时抛出。 */
export class Missing extends GraphError {
  public constructor(
    kind: "node" | "edge" | "port",
    id: NodeId | EdgeId | PortId,
    hint?: string,
  ) {
    super(
      "missing",
      `${kind} "${String(id)}" not found${hint ? ` (${hint})` : ""}`,
    );
    this.name = "Missing";
  }
}

/** 在要求无环的场景检测到环时抛出。 */
export class Cycle extends GraphError {
  /** 构成环的节点序列。 */
  public readonly nodes: ReadonlyArray<NodeId>;

  public constructor(nodes: NodeId[]) {
    super("cycle", `cycle detected: ${nodes.map(String).join(" -> ")}`);
    this.name = "Cycle";
    this.nodes = nodes;
  }
}

/** 源端口与目标端口的类型不兼容时抛出。 */
export class SocketMismatch extends GraphError {
  public constructor(source: string, target: string, edge: EdgeId) {
    super(
      "socket",
      `edge "${String(edge)}": socket "${source}" (source) is incompatible with "${target}" (target)`,
    );
    this.name = "SocketMismatch";
  }
}

/** 端口方向与其在边中的角色不符（源须为输出、目标须为输入）时抛出。 */
export class Misdirected extends GraphError {
  public constructor(
    role: "source" | "target",
    expected: "input" | "output",
    got: string,
    port: PortId,
  ) {
    super(
      "direction",
      `${role} port "${String(port)}" must be ${expected} (got ${got})`,
    );
    this.name = "Misdirected";
  }
}

/** 向单连接端口重复连边时抛出。 */
export class Capacity extends GraphError {
  public constructor(port: PortId) {
    super(
      "capacity",
      `port "${String(port)}" is single-connection but already connected`,
    );
    this.name = "Capacity";
  }
}

/**
 * 端口仍连着边却被移除、或节点带着连边被加入图时抛出。
 * 端口自持边表，跨图复用同一 {@link Vertex} 会让两图的度数互相污染，故一律拒绝。
 */
export class Attached extends GraphError {
  public constructor(port: PortId, hint: string) {
    super(
      "attached",
      `port "${String(port)}" still has connected edges (${hint})`,
    );
    this.name = "Attached";
  }
}

/** 不支持负权的算法遇到负权边时抛出。 */
export class Negative extends GraphError {
  public constructor(cost: number, edge: EdgeId) {
    super(
      "negative",
      `negative edge cost ${cost} on edge "${String(edge)}"; use bellmanFord for negative weights`,
    );
    this.name = "Negative";
  }
}

/** 反序列化时 schema 版本不受支持时抛出。 */
export class Schema extends GraphError {
  public constructor(got: unknown, expected: number) {
    super(
      "schema",
      `unsupported schema version ${String(got)} (expected ${expected})`,
    );
    this.name = "Schema";
  }
}
