/**
 * 测试用的上游 MCP server（纯 JS，由 node 直接拉起）。
 * MOCK_NAME 决定身份，网关的路由落点靠它区分。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const NAME = process.env.MOCK_NAME ?? 'mock';
const mcp = new McpServer({ name: `mock-${NAME}`, version: '1.0.0' });

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

mcp.registerTool(
  'echo',
  {
    title: '回显',
    description: '回显传入的文本，用于验证路由落点',
    inputSchema: { text: z.string() },
    annotations: READ_ONLY,
  },
  ({ text }) => ({ content: [{ type: 'text', text: `${NAME}:${text}` }] }),
);

mcp.registerTool(
  'slow_query',
  { description: '慢查询，用于验证 exclude 过滤', annotations: READ_ONLY },
  () => ({ content: [{ type: 'text', text: `${NAME}:slow` }] }),
);

mcp.registerTool(
  'boom',
  {
    description: '总是失败，用于验证 isError 透传',
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  () => ({ content: [{ type: 'text', text: `${NAME} 故意失败` }], isError: true }),
);

/** 初始隐藏，由 mutate 切换。enable / disable 会自动发出 list_changed。 */
const conditional = mcp.registerTool(
  'added_by_mutate',
  { description: 'mutate 之后才出现的工具', annotations: READ_ONLY },
  () => ({ content: [{ type: 'text', text: `${NAME}:extra` }] }),
);
conditional.disable();

mcp.registerTool(
  'mutate',
  {
    description: '切换工具列表，用于验证网关的变更扇出',
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  () => {
    if (conditional.enabled) conditional.disable();
    else conditional.enable();
    return { content: [{ type: 'text', text: `${NAME}:mutated=${conditional.enabled}` }] };
  },
);

mcp.registerPrompt('greet', { description: `${NAME} 的问候模板` }, () => ({
  messages: [{ role: 'user', content: { type: 'text', text: `来自 ${NAME} 的问候` } }],
}));

mcp.registerResource(
  'config',
  `mock://${NAME}/config`,
  { description: `${NAME} 的配置`, mimeType: 'text/plain' },
  (uri) => ({ contents: [{ uri: uri.href, text: `${NAME} 的配置内容` }] }),
);

await mcp.connect(new StdioServerTransport());
