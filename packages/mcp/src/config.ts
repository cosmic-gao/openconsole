import { createHash } from 'node:crypto';
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type StdioStream = 'inherit' | 'ignore' | 'pipe';

/**
 * keep：保留上次探测到的工具，让模型看到「暂时不可用」而非「不存在」。
 * hide：从列表中移除，模型不会反复尝试一个已知打不通的上游。
 */
export type Unreachable = 'keep' | 'hide';

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
  onUnreachable?: Unreachable;
}

/** 同一个上游挂在不同端点时，可以有不同的呈现。annotations 不可覆盖 —— 那是契约不是外观。 */
export interface ToolOverride {
  name?: string;
  title?: string;
  description?: string;
}

/**
 * full：直接列出全部工具。
 * progressive：只暴露检索与调用的元工具，模型按需取 schema —— 工具上百时保住上下文预算。
 */
export type Discovery = 'full' | 'progressive';

/**
 * 对外名字撞车时的处置。
 * rename：加序号保留，资源则加 alias 前缀 —— 丢工具比换名字严重。
 * reject：丢弃后来者，只保留第一个。
 */
export type Duplicates = 'rename' | 'reject';

/** 一个对外挂载点。省略 upstreams 表示挂载全部。 */
export interface EndpointInput {
  path: string;
  upstreams?: string[];
  discovery?: Discovery;
  /** 键是加前缀后的对外名字，值覆盖该端点上的呈现 */
  overrides?: Record<string, ToolOverride>;
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
  duplicates?: Duplicates;
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
  readonly hideWhenUnreachable: boolean;
  /** 连接层面的身份。热更新时它变了才需要重连，改过滤或改名不必。 */
  readonly identity: string;
}

export interface EndpointSpec {
  readonly path: string;
  readonly upstreams: readonly UpstreamSpec[];
  readonly discovery: Discovery;
  /** 施加该端点的 overrides。输入已带前缀，返回值的 name 即最终对外名字。 */
  readonly decorate: (tool: Tool) => Tool;
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
  /** 撞车时的改名，同样受名字长度上限约束 */
  readonly disambiguate: (name: string, ordinal: number) => string;
  readonly allowsOrigin: (origin: string) => boolean;
  readonly duplicates: Duplicates;
  readonly sessions: SessionLimits;
  readonly upstreams: readonly UpstreamSpec[];
  readonly endpoints: readonly EndpointSpec[];
}

const ALIAS = /^[a-z0-9-]{1,12}$/;
// SEP-986 允许 `/` 而 2025-11-25 规范正文不允许，取交集最安全
const TOOL_NAME = /^[A-Za-z0-9_-]+$/;

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
  // SEP-986 定稿的工具名上限是 64 字符，也是多数 LLM provider 对 function name 的上限
  const maxToolName = input.maxToolNameLength ?? 64;

  return {
    name: input.name ?? 'openmcp',
    version: input.version ?? '0.0.1',
    port: input.port ?? 8080,
    reconcileInterval: input.reconcileIntervalMs ?? 60_000,
    qualify: toQualifier(input.separator ?? '__', maxToolName),
    disambiguate: toDisambiguator(maxToolName),
    allowsOrigin: allowedOrigins ? (origin) => allowedOrigins.includes(origin) : () => true,
    duplicates: input.duplicates ?? 'rename',
    sessions: {
      max: input.sessions?.max ?? 256,
      idleMs: input.sessions?.idleMs ?? 30 * 60_000,
    },
    upstreams,
    endpoints: toEndpointSpecs(input.endpoints ?? [{ path: '/mcp' }], upstreams, maxToolName),
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

/** 序号加在末尾而非中间，同一上游的工具名依旧排在一起 */
const toDisambiguator =
  (maxLength: number) =>
  (name: string, ordinal: number): string => {
    const suffix = `_${ordinal}`;
    const room = maxLength - suffix.length;
    return `${name.length <= room ? name : name.slice(0, room)}${suffix}`;
  };

function toEndpointSpecs(
  inputs: readonly EndpointInput[],
  upstreams: readonly UpstreamSpec[],
  maxToolName: number,
): readonly EndpointSpec[] {
  assertUnique(
    inputs.map((endpoint) => endpoint.path),
    'endpoint path',
  );
  const byId = new Map(upstreams.map((upstream) => [upstream.id, upstream]));

  return inputs.map(({ path, upstreams: ids, discovery, overrides }) => ({
    path,
    discovery: discovery ?? 'full',
    decorate: toDecorator(path, overrides, maxToolName),
    upstreams:
      ids?.map((id) => {
        const upstream = byId.get(id);
        if (!upstream) throw new Error(`端点 ${path} 引用了不存在的上游: ${id}`);
        return upstream;
      }) ?? upstreams,
  }));
}

/** 覆盖只改呈现。annotations 不在可覆盖之列 —— 改 destructiveHint 是伪造契约。 */
function toDecorator(
  path: string,
  overrides: Record<string, ToolOverride> | undefined,
  maxToolName: number,
): (tool: Tool) => Tool {
  if (!overrides) return (tool) => tool;

  const renamed = new Set<string>();
  for (const [key, override] of Object.entries(overrides)) {
    const name = override.name ?? key;
    if (!TOOL_NAME.test(name) || name.length > maxToolName) {
      throw new Error(
        `端点 ${path} 的 overrides.${key}.name 需匹配 ${TOOL_NAME.source} 且不超过 ${maxToolName} 字符`,
      );
    }
    if (renamed.has(name)) throw new Error(`端点 ${path} 的 overrides 改名后重复: ${name}`);
    renamed.add(name);
  }

  return (tool) => {
    const override = overrides[tool.name];
    if (!override) return tool;
    return {
      ...tool,
      name: override.name ?? tool.name,
      ...(override.title !== undefined && { title: override.title }),
      ...(override.description !== undefined && { description: override.description }),
    };
  };
}

function toUpstreamSpec(input: UpstreamInput): UpstreamSpec {
  if (!ALIAS.test(input.alias ?? '')) {
    throw new Error(`上游 ${input.id} 的 alias 需匹配 ${ALIAS.source}`);
  }
  const connection = toConnection(input);
  return {
    id: input.id,
    alias: input.alias,
    connection,
    timeout: input.timeoutMs ?? 30_000,
    breaker: { failures: input.breaker?.failures ?? 5, resetMs: input.breaker?.resetMs ?? 30_000 },
    exposes: toFilter(input.tools),
    hideWhenUnreachable: input.onUnreachable === 'hide',
    identity: JSON.stringify(connection),
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
          env: { ...getDefaultEnvironment(), ...expand(transport.env, id) },
          cwd: transport.cwd ?? process.cwd(),
          stderr: transport.stderr ?? 'inherit',
        },
      };
    case 'http':
      return {
        kind: 'http',
        url: new URL(interpolate(transport.url, id)),
        init: { headers: expand(transport.headers, id) },
      };
    default:
      throw new Error(`上游 ${id} 的 transport.type 必须是 stdio 或 http`);
  }
}

const REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** 凭据写 ${VAR} 由进程环境注入，配置文件本身就不再是密钥载体 */
function interpolate(value: string, id: string): string {
  return value.replace(REFERENCE, (_match, name: string) => {
    const resolved = process.env[name];
    if (resolved === undefined) throw new Error(`上游 ${id} 引用了未定义的环境变量: ${name}`);
    return resolved;
  });
}

const expand = (
  record: Record<string, string> | undefined,
  id: string,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(record ?? {}).map(([key, value]) => [key, interpolate(value, id)]),
  );

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
