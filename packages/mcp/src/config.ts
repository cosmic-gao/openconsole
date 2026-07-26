import { createHash } from 'node:crypto';
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';

export type StdioStream = 'inherit' | 'ignore' | 'pipe';

export interface UpstreamInput {
  id: string;
  alias: string;
  transport:
    | {
        type: 'stdio';
        command: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
        stderr?: StdioStream;
      }
    | { type: 'http'; url: string; headers?: Record<string, string> };
  tools?: { include?: string[]; exclude?: string[] };
  timeoutMs?: number;
  breaker?: { failures?: number; resetMs?: number };
}

/**
 * full：直接列出全部工具。
 * progressive：只暴露检索与调用的元工具，模型按需取 schema —— 工具上百时保住上下文预算。
 */
export type Discovery = 'full' | 'progressive';

/** 一个对外挂载点。省略 upstreams 表示挂载全部。 */
export interface EndpointInput {
  path: string;
  upstreams?: string[];
  discovery?: Discovery;
}

export interface GatewayInput {
  name?: string;
  version?: string;
  port?: number;
  endpoints?: EndpointInput[];
  separator?: string;
  maxToolNameLength?: number;
  reconcileIntervalMs?: number;
  allowedOrigins?: string[];
  sessions?: { max?: number; idleMs?: number };
  upstreams: UpstreamInput[];
}

/** 如何连上一个上游 */
export type Connection =
  | { kind: 'stdio'; params: StdioServerParameters }
  | { kind: 'http'; url: URL; init: RequestInit };

export interface BreakerSpec {
  readonly failures: number;
  readonly resetMs: number;
}

export interface UpstreamSpec {
  readonly id: string;
  readonly alias: string;
  readonly connection: Connection;
  readonly timeout: number;
  readonly breaker: BreakerSpec;
  readonly exposes: (toolName: string) => boolean;
}

export interface EndpointSpec {
  readonly path: string;
  readonly upstreams: readonly UpstreamSpec[];
  readonly discovery: Discovery;
}

/** 会话是内存驻留的，没有上限就等于给未认证流量开了一条内存耗尽路径 */
export interface SessionLimits {
  readonly max: number;
  readonly idleMs: number;
}

export interface GatewaySpec {
  readonly name: string;
  readonly version: string;
  readonly port: number;
  readonly reconcileInterval: number;
  readonly qualify: (alias: string, name: string) => string;
  readonly allowsOrigin: (origin: string) => boolean;
  readonly sessions: SessionLimits;
  readonly upstreams: readonly UpstreamSpec[];
  readonly endpoints: readonly EndpointSpec[];
}

const ALIAS = /^[a-z0-9-]{1,12}$/;

/** 解析成完全确定的规格：缺失与冲突在此处失败，运行时不再判空。 */
export function defineGateway(input: GatewayInput): GatewaySpec {
  const inputs = input.upstreams ?? [];
  if (inputs.length === 0) throw new Error('至少需要配置一个上游');

  assertUnique(
    inputs.map((upstream) => upstream.id),
    'upstream id',
  );
  assertUnique(
    inputs.map((upstream) => upstream.alias),
    'alias',
  );

  const upstreams = inputs.map(toUpstreamSpec);
  const { allowedOrigins } = input;

  return {
    name: input.name ?? 'openmcp',
    version: input.version ?? '0.0.1',
    port: input.port ?? 8080,
    reconcileInterval: input.reconcileIntervalMs ?? 60_000,
    // SEP-986 定稿的工具名上限是 64 字符，也是多数 LLM provider 对 function name 的上限
    qualify: toQualifier(input.separator ?? '__', input.maxToolNameLength ?? 64),
    allowsOrigin: allowedOrigins ? (origin) => allowedOrigins.includes(origin) : () => true,
    sessions: {
      max: input.sessions?.max ?? 256,
      idleMs: input.sessions?.idleMs ?? 30 * 60_000,
    },
    upstreams,
    endpoints: toEndpointSpecs(input.endpoints ?? [{ path: '/mcp' }], upstreams),
  };
}

const toQualifier =
  (separator: string, maxLength: number) =>
  (alias: string, name: string): string => {
    const qualified = `${alias}${separator}${name}`;
    if (qualified.length <= maxLength) return qualified;
    const digest = createHash('sha256').update(qualified).digest('hex').slice(0, 6);
    return `${qualified.slice(0, maxLength - digest.length - 1)}_${digest}`;
  };

function toEndpointSpecs(
  inputs: readonly EndpointInput[],
  upstreams: readonly UpstreamSpec[],
): readonly EndpointSpec[] {
  assertUnique(
    inputs.map((endpoint) => endpoint.path),
    'endpoint path',
  );
  const byId = new Map(upstreams.map((upstream) => [upstream.id, upstream]));

  return inputs.map(({ path, upstreams: ids, discovery }) => ({
    path,
    discovery: discovery ?? 'full',
    upstreams:
      ids?.map((id) => {
        const upstream = byId.get(id);
        if (!upstream) throw new Error(`端点 ${path} 引用了不存在的上游: ${id}`);
        return upstream;
      }) ?? upstreams,
  }));
}

function toUpstreamSpec(input: UpstreamInput): UpstreamSpec {
  if (!ALIAS.test(input.alias ?? '')) {
    throw new Error(`上游 ${input.id} 的 alias 需匹配 ${ALIAS.source}`);
  }
  return {
    id: input.id,
    alias: input.alias,
    connection: toConnection(input),
    timeout: input.timeoutMs ?? 30_000,
    breaker: { failures: input.breaker?.failures ?? 5, resetMs: input.breaker?.resetMs ?? 30_000 },
    exposes: toFilter(input.tools),
  };
}

function toConnection({ id, transport }: UpstreamInput): Connection {
  switch (transport?.type) {
    case 'stdio':
      return {
        kind: 'stdio',
        params: {
          command: transport.command,
          args: transport.args ?? [],
          env: { ...getDefaultEnvironment(), ...transport.env },
          cwd: transport.cwd ?? process.cwd(),
          stderr: transport.stderr ?? 'inherit',
        },
      };
    case 'http':
      return {
        kind: 'http',
        url: new URL(transport.url),
        init: { headers: transport.headers ?? {} },
      };
    default:
      throw new Error(`上游 ${id} 的 transport.type 必须是 stdio 或 http`);
  }
}

function toFilter(rules: UpstreamInput['tools']): (name: string) => boolean {
  const include = rules?.include?.map(toPattern);
  const exclude = rules?.exclude?.map(toPattern);
  return (name) => {
    if (exclude?.some((pattern) => pattern.test(name))) return false;
    return include?.some((pattern) => pattern.test(name)) ?? true;
  };
}

const toPattern = (glob: string): RegExp =>
  new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

function assertUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate !== undefined) throw new Error(`${label} 重复: ${duplicate}`);
}
