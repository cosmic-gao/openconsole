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
import { reasonOf } from './upstream.js';

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

const PAGE_SIZE = 100;

export function createMcpServer(
  spec: GatewaySpec,
  endpoint: Endpoint,
  middleware: readonly Middleware[],
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

  server.setRequestHandler(ListToolsRequestSchema, ({ params }) => {
    const { catalog, version } = endpoint.snapshot;
    const { items, nextCursor } = paginate(catalog.tools, params?.cursor, version);
    return { tools: items, ...(nextCursor && { nextCursor }) };
  });

  server.setRequestHandler(ListPromptsRequestSchema, ({ params }) => {
    const { catalog, version } = endpoint.snapshot;
    const { items, nextCursor } = paginate(catalog.prompts, params?.cursor, version);
    return { prompts: items, ...(nextCursor && { nextCursor }) };
  });

  server.setRequestHandler(ListResourcesRequestSchema, ({ params }) => {
    const { catalog, version } = endpoint.snapshot;
    const { items, nextCursor } = paginate(catalog.resources, params?.cursor, version);
    return { resources: items, ...(nextCursor && { nextCursor }) };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({
    resourceTemplates: endpoint.snapshot.catalog.resourceTemplates,
  }));

  server.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
    const entry = endpoint.snapshot.catalog.tool(params.name);
    if (!entry) throw new McpError(ErrorCode.InvalidParams, `未知工具: ${params.name}`);

    const { upstream, name } = entry.route;
    const ctx: CallContext = {
      name: params.name,
      tool: entry.definition,
      upstreamId: upstream.spec.id,
      args: params.arguments,
      auth: extra.authInfo,
      signal: extra.signal,
    };

    return runChain(middleware, ctx, async () => {
      try {
        return await upstream.callTool(name, ctx.args, ctx.signal);
      } catch (error) {
        // 上游故障用 isError 而非协议错误：模型该知道是「暂时不可用」，不是「工具不存在」
        return {
          content: [{ type: 'text', text: `上游 ${upstream.spec.id} 不可用: ${reasonOf(error)}` }],
          isError: true,
        };
      }
    });
  });

  server.setRequestHandler(GetPromptRequestSchema, async ({ params }) => {
    const entry = endpoint.snapshot.catalog.prompt(params.name);
    if (!entry) throw new McpError(ErrorCode.InvalidParams, `未知 prompt: ${params.name}`);
    return entry.route.upstream.getPrompt(entry.route.name, params.arguments);
  });

  // URI 未被改写，可直接原样交给上游
  server.setRequestHandler(ReadResourceRequestSchema, async ({ params }) => {
    const entry = endpoint.snapshot.catalog.resource(params.uri);
    if (!entry) throw new McpError(ErrorCode.InvalidParams, `未知资源: ${params.uri}`);
    return entry.route.upstream.readResource(params.uri);
  });

  return mcp;
}

function runChain(
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
