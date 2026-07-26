import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { GatewaySpec } from './config.js';
import type { Reconciler } from './reconciler.js';

export interface CallContext {
  /** 带前缀的对外名字 */
  readonly name: string;
  readonly tool: Tool;
  readonly upstreamId: string;
  readonly args: Record<string, unknown> | undefined;
  readonly auth: unknown;
  readonly signal: AbortSignal;
}

export type Middleware = (
  ctx: CallContext,
  next: () => Promise<CallToolResult>,
) => Promise<CallToolResult>;

const PAGE_SIZE = 100;

export function createMcpServer(
  spec: GatewaySpec,
  reconciler: Reconciler,
  middleware: readonly Middleware[],
): McpServer {
  const mcp = new McpServer(
    { name: spec.name, version: spec.version },
    { capabilities: { tools: { listChanged: true }, prompts: { listChanged: true } } },
  );

  // 不走 registerTool：它的 schema 只接受 Zod，会把上游的原始 JSON Schema 降级成空对象
  const { server } = mcp;

  server.setRequestHandler(ListToolsRequestSchema, ({ params }) => {
    const { catalog, version } = reconciler.snapshot;
    const offset = params?.cursor === undefined ? 0 : decodeCursor(params.cursor, version);
    const end = offset + PAGE_SIZE;
    return {
      tools: catalog.tools.slice(offset, end),
      ...(end < catalog.tools.length && { nextCursor: encodeCursor(end, version) }),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
    const entry = reconciler.snapshot.catalog.tool(params.name);
    if (!entry) throw new McpError(ErrorCode.InvalidParams, `未知工具: ${params.name}`);

    const { upstream, name } = entry.route;
    const ctx: CallContext = {
      name: params.name,
      tool: entry.tool,
      upstreamId: upstream.spec.id,
      args: params.arguments,
      auth: extra.authInfo,
      signal: extra.signal,
    };

    return runChain(middleware, ctx, async () => {
      try {
        return await upstream.callTool(name, ctx.args, ctx.signal);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `上游 ${upstream.spec.id} 不可用: ${reason}` }],
          isError: true,
        };
      }
    });
  });

  server.setRequestHandler(ListPromptsRequestSchema, () => ({
    prompts: reconciler.snapshot.catalog.prompts,
  }));

  server.setRequestHandler(GetPromptRequestSchema, async ({ params }) => {
    const entry = reconciler.snapshot.catalog.prompt(params.name);
    if (!entry) throw new McpError(ErrorCode.InvalidParams, `未知 prompt: ${params.name}`);
    return entry.route.upstream.getPrompt(entry.route.name, params.arguments);
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

const encodeCursor = (offset: number, version: number): string =>
  Buffer.from(`${version}:${offset}`).toString('base64url');

/** 游标绑定快照版本，上游变更后旧游标失效，客户端不会翻到错位的页 */
function decodeCursor(cursor: string, version: number): number {
  const [encodedVersion, encodedOffset] = Buffer.from(cursor, 'base64url').toString().split(':');
  const offset = Number(encodedOffset);
  if (encodedVersion !== String(version) || !Number.isInteger(offset) || offset < 0) {
    throw new McpError(ErrorCode.InvalidParams, '工具列表已变更，请重新列举');
  }
  return offset;
}
