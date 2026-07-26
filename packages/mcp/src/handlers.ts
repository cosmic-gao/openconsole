import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  CallToolResult,
  GetPromptResult,
  Prompt,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { GatewaySpec } from './config.js';
import type { Endpoint } from './endpoint.js';
import type { Upstream } from './upstream.js';
import { describeError, isTransportFailure } from './upstream.js';

/**
 * 会触达上游的三个方法，中间件的作用范围。
 * 列举类方法不在其中：它们读的是本地快照，不产生上游调用，也就没有可治理的副作用。
 */
export type Method = 'tools/call' | 'prompts/get' | 'resources/read';

export type Outcome = CallToolResult | GetPromptResult | ReadResourceResult;

/** 可被裁剪的条目。四者都有 name，按名字过滤的中间件无需判别具体类型。 */
export type Listed = Tool | Prompt | Resource | ResourceTemplate;

export interface CallContext {
  readonly method: Method;
  /** 对外标识：工具与 prompt 是名字，资源是 URI */
  readonly name: string;
  readonly upstreamId: string;
  /** 仅 tools/call 带定义 —— annotations 是工具独有的 */
  readonly tool: Tool | undefined;
  readonly args: Record<string, unknown> | undefined;
  readonly auth: AuthInfo | undefined;
  readonly signal: AbortSignal;
}

export type Middleware = (ctx: CallContext, next: () => Promise<Outcome>) => Promise<Outcome>;

/** 按调用者裁剪可见条目。规范允许工具集随请求携带的授权变化。 */
export type Visibility = (item: Listed, auth: AuthInfo | undefined) => boolean;

export interface HandlerOptions {
  readonly middleware: readonly Middleware[];
  readonly visibility?: Visibility;
}

interface RequestExtra {
  readonly authInfo?: AuthInfo;
  readonly signal: AbortSignal;
}

/** 已解析到具体上游的一次调用 */
interface Call {
  readonly method: Method;
  readonly name: string;
  readonly upstream: Upstream;
  /** 上游侧的名字或 URI */
  readonly target: string;
  readonly tool: Tool | undefined;
  readonly args: Record<string, unknown> | undefined;
}

type Invoke = (call: Call, extra: RequestExtra) => Promise<Outcome>;

const PAGE_SIZE = 100;
const SEARCH_LIMIT = 10;

export function createMcpServer(
  spec: GatewaySpec,
  endpoint: Endpoint,
  options: HandlerOptions,
): McpServer {
  const mcp = new McpServer(
    { name: spec.name, version: spec.version },
    {
      instructions: endpoint.instructions,
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { listChanged: true },
      },
    },
  );

  // 不走 registerTool：它的 schema 只接受 Zod，会把上游的原始 JSON Schema 降级成空对象
  const { server } = mcp;
  const invoke = createInvoker(options.middleware);
  const { visibility } = options;

  const admits = (item: Listed, auth: AuthInfo | undefined): boolean =>
    visibility === undefined || visibility(item, auth);

  const listable = <T extends Listed>(items: readonly T[], auth: AuthInfo | undefined): readonly T[] =>
    visibility === undefined ? items : items.filter((item) => admits(item, auth));

  /** 不可见等同不存在。只裁列表不裁调用，裁剪就只是障眼法。 */
  const resolveTool = (name: string, auth: AuthInfo | undefined): Call => {
    const entry = endpoint.snapshot.catalog.tool(name);
    if (!entry || !admits(entry.definition, auth)) {
      throw new McpError(ErrorCode.InvalidParams, `未知工具: ${name}`);
    }
    return {
      method: 'tools/call',
      name,
      upstream: entry.route.upstream,
      target: entry.route.name,
      tool: entry.definition,
      args: undefined,
    };
  };

  if (endpoint.discovery === 'progressive') {
    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: META_TOOLS }));
    server.setRequestHandler(CallToolRequestSchema, ({ params }, extra) =>
      dispatchMeta(params.name, params.arguments, {
        tools: listable(endpoint.snapshot.catalog.tools, extra.authInfo),
        resolve: (name) => resolveTool(name, extra.authInfo),
        invoke,
        extra,
      }),
    );
  } else {
    server.setRequestHandler(ListToolsRequestSchema, ({ params }, extra) => {
      const { items, nextCursor } = paginate(
        listable(endpoint.snapshot.catalog.tools, extra.authInfo),
        params?.cursor,
        endpoint.snapshot.version,
      );
      return { tools: items, ...(nextCursor && { nextCursor }) };
    });
    server.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
      const call = resolveTool(params.name, extra.authInfo);
      return (await invoke({ ...call, args: params.arguments }, extra)) as CallToolResult;
    });
  }

  server.setRequestHandler(ListPromptsRequestSchema, ({ params }, extra) => {
    const { catalog, version } = endpoint.snapshot;
    const { items, nextCursor } = paginate(
      listable(catalog.prompts, extra.authInfo),
      params?.cursor,
      version,
    );
    return { prompts: items, ...(nextCursor && { nextCursor }) };
  });

  server.setRequestHandler(GetPromptRequestSchema, async ({ params }, extra) => {
    const entry = endpoint.snapshot.catalog.prompt(params.name);
    if (!entry || !admits(entry.definition, extra.authInfo)) {
      throw new McpError(ErrorCode.InvalidParams, `未知 prompt: ${params.name}`);
    }
    const call: Call = {
      method: 'prompts/get',
      name: params.name,
      upstream: entry.route.upstream,
      target: entry.route.name,
      tool: undefined,
      args: params.arguments,
    };
    return (await invoke(call, extra)) as GetPromptResult;
  });

  server.setRequestHandler(ListResourcesRequestSchema, ({ params }, extra) => {
    const { catalog, version } = endpoint.snapshot;
    const { items, nextCursor } = paginate(
      listable(catalog.resources, extra.authInfo),
      params?.cursor,
      version,
    );
    return { resources: items, ...(nextCursor && { nextCursor }) };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, (_request, extra) => ({
    resourceTemplates: listable(endpoint.snapshot.catalog.resourceTemplates, extra.authInfo),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async ({ params }, extra) => {
    const hit = endpoint.snapshot.catalog.resource(params.uri);
    if (!hit || !admits(hit.definition, extra.authInfo)) {
      throw new McpError(ErrorCode.InvalidParams, `未知资源: ${params.uri}`);
    }
    const call: Call = {
      method: 'resources/read',
      name: params.uri,
      upstream: hit.route.upstream,
      // 对外 URI 可能因撞车带了 alias 前缀，发给上游的必须是它自己认得的那个
      target: hit.target,
      tool: undefined,
      args: undefined,
    };
    return (await invoke(call, extra)) as ReadResourceResult;
  });

  return mcp;
}

/**
 * 唯一的上游执行路径。三个方法与元工具共用它，中间件因此没有绕行的口子。
 * 错误分三层落位，中间件看到的是真实异常而不是被吞掉的 isError。
 */
function createInvoker(middleware: readonly Middleware[]): Invoke {
  return async (call, extra) => {
    const ctx: CallContext = {
      method: call.method,
      name: call.name,
      upstreamId: call.upstream.spec.id,
      tool: call.tool,
      args: call.args,
      auth: extra.authInfo,
      signal: extra.signal,
    };

    const forward = async (): Promise<Outcome> => {
      try {
        return await send(call, extra.signal);
      } catch (error) {
        // 只有工具调用有 isError 通道可以把业务错误交给模型自纠。
        // prompts/get 与 resources/read 没有，错误只能保持协议错误原样上抛。
        if (call.method !== 'tools/call' || isTransportFailure(error)) throw error;
        return { content: [{ type: 'text', text: describeError(error) }], isError: true };
      }
    };

    try {
      return await applyMiddleware(middleware, ctx, forward);
    } catch (error) {
      // 中间件的显式拒绝保持协议错误 —— 限流与鉴权拒绝不该被模型当成「工具坏了」反复重试
      if (error instanceof McpError && !isTransportFailure(error)) throw error;

      const reason = `上游 ${call.upstream.spec.id} 不可用: ${describeError(error)}`;
      if (call.method !== 'tools/call') throw new McpError(ErrorCode.InternalError, reason);
      return { content: [{ type: 'text', text: reason }], isError: true };
    }
  };
}

function send(call: Call, signal: AbortSignal): Promise<Outcome> {
  switch (call.method) {
    case 'tools/call':
      return call.upstream.callTool(call.target, call.args, signal);
    case 'prompts/get':
      // prompt 参数在协议上就是字符串字典，这里只是把统一的 args 还原回去
      return call.upstream.getPrompt(call.target, call.args as Record<string, string>, signal);
    case 'resources/read':
      return call.upstream.readResource(call.target, signal);
  }
}

const SEARCH = 'search_tools';
const DESCRIBE = 'describe_tool';
const CALL = 'call_tool';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const META_TOOLS: readonly Tool[] = [
  {
    name: SEARCH,
    title: '检索工具',
    description: '按关键词检索可用工具，返回名字与简介。拿到名字后用 describe_tool 取参数定义。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词，空格分隔' },
        limit: { type: 'integer', description: `返回条数上限，默认 ${SEARCH_LIMIT}` },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: DESCRIBE,
    title: '查看工具定义',
    description: '取某个工具的完整定义，含参数 JSON Schema。',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'search_tools 返回的工具名' } },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: CALL,
    title: '调用工具',
    description: '调用一个工具。name 来自 search_tools，arguments 需符合 describe_tool 给出的 schema。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        arguments: { type: 'object', description: '目标工具的参数' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    // 真实风险取决于被调用的工具，保守声明以免宿主跳过确认
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
];

interface MetaScope {
  readonly tools: readonly Tool[];
  readonly resolve: (name: string) => Call;
  readonly invoke: Invoke;
  readonly extra: RequestExtra;
}

function dispatchMeta(
  name: string,
  args: Record<string, unknown> | undefined,
  scope: MetaScope,
): CallToolResult | Promise<CallToolResult> {
  switch (name) {
    case SEARCH:
      return toTextResult(
        search(scope.tools, requireString(args, 'query'), optionalInteger(args, 'limit')),
      );
    case DESCRIBE: {
      const target = requireString(args, 'name');
      const tool = scope.tools.find((candidate) => candidate.name === target);
      if (!tool) throw new McpError(ErrorCode.InvalidParams, `未知工具: ${target}`);
      return toTextResult(tool);
    }
    case CALL: {
      const call = scope.resolve(requireString(args, 'name'));
      return scope.invoke(
        { ...call, args: optionalObject(args, 'arguments') },
        scope.extra,
      ) as Promise<CallToolResult>;
    }
    default:
      throw new McpError(ErrorCode.InvalidParams, `未知工具: ${name}`);
  }
}

/** 名字命中权重高于描述，足以把「查 pod 日志」这类意图排到前面，且无需额外依赖 */
function search(
  tools: readonly Tool[],
  query: string,
  limit: number | undefined,
): { name: string; description: string }[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const relevance = (tool: Tool): number => {
    const name = tool.name.toLowerCase();
    const description = (tool.description ?? '').toLowerCase();
    return terms.reduce(
      (total, term) => total + (name.includes(term) ? 3 : 0) + (description.includes(term) ? 1 : 0),
      0,
    );
  };

  return tools
    .map((tool) => ({ tool, weight: relevance(tool) }))
    .filter(({ weight }) => weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, limit ?? SEARCH_LIMIT)
    .map(({ tool }) => ({ name: tool.name, description: tool.description ?? '' }));
}

const toTextResult = (payload: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
});

function requireString(args: Record<string, unknown> | undefined, key: string): string {
  const value = args?.[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new McpError(ErrorCode.InvalidParams, `参数 ${key} 必须是非空字符串`);
  }
  return value;
}

function optionalInteger(args: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = args?.[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new McpError(ErrorCode.InvalidParams, `参数 ${key} 必须是正整数`);
  }
  return value;
}

function optionalObject(
  args: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = args?.[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new McpError(ErrorCode.InvalidParams, `参数 ${key} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function applyMiddleware(
  middleware: readonly Middleware[],
  ctx: CallContext,
  invoke: () => Promise<Outcome>,
): Promise<Outcome> {
  const step = (index: number): Promise<Outcome> => {
    const current = middleware[index];
    return current ? current(ctx, () => step(index + 1)) : invoke();
  };
  return step(0);
}

function paginate<T>(
  items: readonly T[],
  cursor: string | undefined,
  version: number,
): { items: readonly T[]; nextCursor?: string } {
  const offset = cursor === undefined ? 0 : decodeCursor(cursor, version);
  const end = offset + PAGE_SIZE;
  return {
    items: items.slice(offset, end),
    ...(end < items.length && { nextCursor: encodeCursor(end, version) }),
  };
}

const encodeCursor = (offset: number, version: number): string =>
  Buffer.from(`${version}:${offset}`).toString('base64url');

/** 游标绑定快照版本，上游变更后旧游标失效，客户端不会翻到错位的页 */
function decodeCursor(cursor: string, version: number): number {
  const [encodedVersion, encodedOffset] = Buffer.from(cursor, 'base64url').toString().split(':');
  const offset = Number(encodedOffset);
  if (encodedVersion !== String(version) || !Number.isInteger(offset) || offset < 0) {
    throw new McpError(ErrorCode.InvalidParams, '列表已变更，请重新列举');
  }
  return offset;
}
