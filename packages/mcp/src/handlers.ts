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
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { GatewaySpec } from './config.js';
import type { Endpoint } from './endpoint.js';
import { describeError, isTransportFailure } from './upstream.js';

export interface CallContext {
  /** 带前缀的对外名字 */
  readonly name: string;
  readonly tool: Tool;
  readonly upstreamId: string;
  readonly args: Record<string, unknown> | undefined;
  readonly auth: AuthInfo | undefined;
  readonly signal: AbortSignal;
}

export type Middleware = (
  ctx: CallContext,
  next: () => Promise<CallToolResult>,
) => Promise<CallToolResult>;

/** 按调用者裁剪可见工具。规范允许工具集随请求携带的授权变化。 */
export type Visibility = (tool: Tool, auth: AuthInfo | undefined) => boolean;

export interface HandlerOptions {
  readonly middleware: readonly Middleware[];
  readonly visibility?: Visibility;
}

interface RequestExtra {
  readonly authInfo?: AuthInfo;
  readonly signal: AbortSignal;
}

type InvokeTool = (
  name: string,
  args: Record<string, unknown> | undefined,
  extra: RequestExtra,
) => Promise<CallToolResult>;

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
  const invoke = createInvoker(endpoint, options.middleware);
  const visibleTools = (auth: AuthInfo | undefined): readonly Tool[] => {
    const { tools } = endpoint.snapshot.catalog;
    return options.visibility ? tools.filter((tool) => options.visibility?.(tool, auth)) : tools;
  };

  if (endpoint.discovery === 'progressive') {
    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: META_TOOLS }));
    server.setRequestHandler(CallToolRequestSchema, ({ params }, extra) =>
      dispatchMeta(params.name, params.arguments, visibleTools(extra.authInfo), invoke, extra),
    );
  } else {
    server.setRequestHandler(ListToolsRequestSchema, ({ params }, extra) => {
      const { items, nextCursor } = paginate(
        visibleTools(extra.authInfo),
        params?.cursor,
        endpoint.snapshot.version,
      );
      return { tools: items, ...(nextCursor && { nextCursor }) };
    });
    server.setRequestHandler(CallToolRequestSchema, ({ params }, extra) =>
      invoke(params.name, params.arguments, extra),
    );
  }

  server.setRequestHandler(ListPromptsRequestSchema, ({ params }) => {
    const { catalog, version } = endpoint.snapshot;
    const { items, nextCursor } = paginate(catalog.prompts, params?.cursor, version);
    return { prompts: items, ...(nextCursor && { nextCursor }) };
  });

  server.setRequestHandler(GetPromptRequestSchema, async ({ params }) => {
    const entry = endpoint.snapshot.catalog.prompt(params.name);
    if (!entry) throw new McpError(ErrorCode.InvalidParams, `未知 prompt: ${params.name}`);
    return entry.route.upstream.getPrompt(entry.route.name, params.arguments);
  });

  server.setRequestHandler(ListResourcesRequestSchema, ({ params }) => {
    const { catalog, version } = endpoint.snapshot;
    const { items, nextCursor } = paginate(catalog.resources, params?.cursor, version);
    return { resources: items, ...(nextCursor && { nextCursor }) };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({
    resourceTemplates: endpoint.snapshot.catalog.resourceTemplates,
  }));

  // URI 未被改写，可直接原样交给上游
  server.setRequestHandler(ReadResourceRequestSchema, async ({ params }) => {
    const entry = endpoint.snapshot.catalog.resource(params.uri);
    if (!entry) throw new McpError(ErrorCode.InvalidParams, `未知资源: ${params.uri}`);
    return entry.route.upstream.readResource(params.uri);
  });

  return mcp;
}

/** 唯一的工具执行路径。两种发现模式共用它，元工具因此无法绕过中间件。 */
function createInvoker(endpoint: Endpoint, middleware: readonly Middleware[]): InvokeTool {
  return async (name, args, extra) => {
    const entry = endpoint.snapshot.catalog.tool(name);
    if (!entry) throw new McpError(ErrorCode.InvalidParams, `未知工具: ${name}`);

    const { upstream, name: upstreamName } = entry.route;
    const ctx: CallContext = {
      name,
      tool: entry.definition,
      upstreamId: upstream.spec.id,
      args,
      auth: extra.authInfo,
      signal: extra.signal,
    };

    const forward = async (): Promise<CallToolResult> => {
      try {
        return await upstream.callTool(upstreamName, args, extra.signal);
      } catch (error) {
        // 上游的业务与参数错误交给模型自纠；传输故障向上抛，好让重试中间件有机会介入
        if (isTransportFailure(error)) throw error;
        return { content: [{ type: 'text', text: describeError(error) }], isError: true };
      }
    };

    try {
      return await applyMiddleware(middleware, ctx, forward);
    } catch (error) {
      // 中间件的显式拒绝保持协议错误；无从重试的传输故障转成模型读得懂的失败
      if (error instanceof McpError && !isTransportFailure(error)) throw error;
      return {
        content: [{ type: 'text', text: `上游 ${upstream.spec.id} 不可用: ${describeError(error)}` }],
        isError: true,
      };
    }
  };
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

function dispatchMeta(
  name: string,
  args: Record<string, unknown> | undefined,
  tools: readonly Tool[],
  invoke: InvokeTool,
  extra: RequestExtra,
): CallToolResult | Promise<CallToolResult> {
  switch (name) {
    case SEARCH:
      return toTextResult(search(tools, requireString(args, 'query'), optionalInteger(args, 'limit')));
    case DESCRIBE: {
      const target = requireString(args, 'name');
      const tool = tools.find((candidate) => candidate.name === target);
      if (!tool) throw new McpError(ErrorCode.InvalidParams, `未知工具: ${target}`);
      return toTextResult(tool);
    }
    case CALL:
      return invoke(requireString(args, 'name'), optionalObject(args, 'arguments'), extra);
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
  invoke: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const step = (index: number): Promise<CallToolResult> => {
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
