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
}

export interface GatewayInput {
  name?: string;
  version?: string;
  port?: number;
  path?: string;
  separator?: string;
  maxToolNameLength?: number;
  reconcileIntervalMs?: number;
  allowedOrigins?: string[];
  upstreams: UpstreamInput[];
}

export type Endpoint =
  | { kind: 'stdio'; params: StdioServerParameters }
  | { kind: 'http'; url: URL; init: RequestInit };

export interface UpstreamSpec {
  readonly id: string;
  readonly alias: string;
  readonly endpoint: Endpoint;
  readonly timeout: number;
  readonly exposes: (toolName: string) => boolean;
}

export interface GatewaySpec {
  readonly name: string;
  readonly version: string;
  readonly port: number;
  readonly path: string;
  readonly reconcileInterval: number;
  readonly qualify: (alias: string, toolName: string) => string;
  readonly allowsOrigin: (origin: string) => boolean;
  readonly upstreams: readonly UpstreamSpec[];
}

const ALIAS = /^[a-z0-9-]{1,12}$/;

/** 解析成完全确定的规格：缺失与冲突在此处失败，运行时不再判空。 */
export function defineGateway(input: GatewayInput): GatewaySpec {
  const upstreams = input.upstreams ?? [];
  if (upstreams.length === 0) throw new Error('至少需要配置一个上游');

  assertUnique(
    upstreams.map((upstream) => upstream.id),
    'upstream id',
  );
  assertUnique(
    upstreams.map((upstream) => upstream.alias),
    'alias',
  );

  const { allowedOrigins } = input;
  return {
    name: input.name ?? 'openmcp',
    version: input.version ?? '0.0.1',
    port: input.port ?? 8080,
    path: input.path ?? '/mcp',
    reconcileInterval: input.reconcileIntervalMs ?? 60_000,
    qualify: toQualifier(input.separator ?? '__', input.maxToolNameLength ?? 64),
    allowsOrigin: allowedOrigins ? (origin) => allowedOrigins.includes(origin) : () => true,
    upstreams: upstreams.map(toUpstreamSpec),
  };
}

/** 超长则截断加摘要，同一输入永远得到同一结果 */
const toQualifier =
  (separator: string, maxLength: number) =>
  (alias: string, toolName: string): string => {
    const qualified = `${alias}${separator}${toolName}`;
    if (qualified.length <= maxLength) return qualified;
    const digest = createHash('sha256').update(qualified).digest('hex').slice(0, 6);
    return `${qualified.slice(0, maxLength - digest.length - 1)}_${digest}`;
  };

function toUpstreamSpec(input: UpstreamInput): UpstreamSpec {
  if (!ALIAS.test(input.alias ?? '')) {
    throw new Error(`上游 ${input.id} 的 alias 需匹配 ${ALIAS.source}`);
  }
  return {
    id: input.id,
    alias: input.alias,
    endpoint: toEndpoint(input),
    timeout: input.timeoutMs ?? 30_000,
    exposes: toFilter(input.tools),
  };
}

function toEndpoint({ id, transport }: UpstreamInput): Endpoint {
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
      return { kind: 'http', url: new URL(transport.url), init: { headers: transport.headers ?? {} } };
    default:
      throw new Error(`上游 ${id} 的 transport.type 必须是 stdio 或 http`);
  }
}

function toFilter(rules: UpstreamInput['tools']): (toolName: string) => boolean {
  const include = rules?.include?.map(toPattern);
  const exclude = rules?.exclude?.map(toPattern);
  return (toolName) => {
    if (exclude?.some((pattern) => pattern.test(toolName))) return false;
    return include?.some((pattern) => pattern.test(toolName)) ?? true;
  };
}

const toPattern = (glob: string): RegExp =>
  new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

function assertUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate !== undefined) throw new Error(`${label} 重复: ${duplicate}`);
}
