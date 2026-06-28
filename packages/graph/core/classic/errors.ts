import type { EdgeId, NodeId, PortId } from '../types';

export type Code =
  | 'duplicate'
  | 'missing'
  | 'cycle'
  | 'socket'
  | 'direction'
  | 'negative'
  | 'schema';

export class GraphError extends Error {
  public readonly code: Code;

  public constructor(code: Code, message: string) {
    super(message);
    this.name = 'GraphError';
    this.code = code;
  }
}

export class Duplicate extends GraphError {
  public constructor(kind: 'node' | 'edge', id: NodeId | EdgeId) {
    super('duplicate', `${kind} "${String(id)}" already exists`);
    this.name = 'Duplicate';
  }
}

export class Missing extends GraphError {
  public constructor(kind: 'node' | 'edge' | 'port', id: NodeId | EdgeId | PortId, hint?: string) {
    super('missing', `${kind} "${String(id)}" not found${hint ? ` (${hint})` : ''}`);
    this.name = 'Missing';
  }
}

export class Cycle extends GraphError {
  public readonly nodes: ReadonlyArray<NodeId>;

  public constructor(nodes: NodeId[]) {
    super('cycle', `cycle detected: ${nodes.map(String).join(' -> ')}`);
    this.name = 'Cycle';
    this.nodes = nodes;
  }
}

export class SocketMismatch extends GraphError {
  public constructor(source: string, target: string, edge: EdgeId) {
    super(
      'socket',
      `edge "${String(edge)}": socket "${source}" (source) is incompatible with "${target}" (target)`,
    );
    this.name = 'SocketMismatch';
  }
}

export class Misdirected extends GraphError {
  public constructor(
    role: 'source' | 'target',
    expected: 'input' | 'output',
    got: string,
    port: PortId,
  ) {
    super('direction', `${role} port "${String(port)}" must be ${expected} (got ${got})`);
    this.name = 'Misdirected';
  }
}

export class Negative extends GraphError {
  public constructor(cost: number, edge: EdgeId) {
    super(
      'negative',
      `negative edge cost ${cost} on edge "${String(edge)}"; use bellmanFord for negative weights`,
    );
    this.name = 'Negative';
  }
}

export class Schema extends GraphError {
  public constructor(got: unknown, expected: number) {
    super('schema', `unsupported schema version ${String(got)} (expected ${expected})`);
    this.name = 'Schema';
  }
}
