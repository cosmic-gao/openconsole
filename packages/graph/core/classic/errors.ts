/**
 * 类型化错误层：替代散落的 `throw new Error(...)`，让上层 `catch` 能按 `instanceof` 精准分支。
 *
 * @remarks
 * 命名约定：错误类名两词（动作 + 主体）保持可读，文件名单词 `errors`。
 * 所有具体错误均继承 {@link GraphError}，构造时自动带上图 ID + 操作上下文前缀。
 */

import type { EdgeId, NodeId, PortId } from '../types';

/** 错误码联合：稳定字符串，可用于跨语言 / 网络协议。 */
export type Code =
  | 'duplicate'
  | 'missing'
  | 'cycle'
  | 'socket'
  | 'direction'
  | 'negative'
  | 'schema';

/** 所有图错误的基类。 */
export class GraphError extends Error {
  public readonly code: Code;

  public constructor(code: Code, message: string) {
    super(message);
    this.name = 'GraphError';
    this.code = code;
  }
}

/** 同 ID 的节点 / 边 / 端口已存在。 */
export class Duplicate extends GraphError {
  public constructor(kind: 'node' | 'edge', id: NodeId | EdgeId) {
    super('duplicate', `${kind} "${String(id)}" already exists`);
    this.name = 'Duplicate';
  }
}

/** 节点 / 端口 / 边引用了不存在的 ID。 */
export class Missing extends GraphError {
  public constructor(
    kind: 'node' | 'edge' | 'port',
    id: NodeId | EdgeId | PortId,
    hint?: string,
  ) {
    super('missing', `${kind} "${String(id)}" not found${hint ? ` (${hint})` : ''}`);
    this.name = 'Missing';
  }
}

/** 检测到环。 */
export class Cycle extends GraphError {
  public readonly nodes: ReadonlyArray<NodeId>;

  public constructor(nodes: NodeId[]) {
    super('cycle', `cycle detected: ${nodes.map(String).join(' -> ')}`);
    this.name = 'Cycle';
    this.nodes = nodes;
  }
}

/** 两端 Socket 类型不兼容。 */
export class SocketMismatch extends GraphError {
  public constructor(source: string, target: string, edge: EdgeId) {
    super(
      'socket',
      `edge "${String(edge)}": socket "${source}" (source) is incompatible with "${target}" (target)`,
    );
    this.name = 'SocketMismatch';
  }
}

/** 端口方向不对（如 source 不是 output）。 */
export class Misdirected extends GraphError {
  public constructor(role: 'source' | 'target', expected: 'input' | 'output', got: string, port: PortId) {
    super(
      'direction',
      `${role} port "${String(port)}" must be ${expected} (got ${got})`,
    );
    this.name = 'Misdirected';
  }
}

/** 算法收到非法的负权边。 */
export class Negative extends GraphError {
  public constructor(cost: number, edge: EdgeId) {
    super(
      'negative',
      `negative edge cost ${cost} on edge "${String(edge)}"; use Bellman-Ford for negative weights`,
    );
    this.name = 'Negative';
  }
}

/** 反序列化时遇到不支持的 schema 版本。 */
export class Schema extends GraphError {
  public constructor(got: unknown, expected: number) {
    super('schema', `unsupported schema version ${String(got)} (expected ${expected})`);
    this.name = 'Schema';
  }
}
