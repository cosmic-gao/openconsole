import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGateway, type Gateway, type GatewayInput, type Middleware } from '../src/index.js';

const MOCK = join(dirname(fileURLToPath(import.meta.url)), 'mock-server.js');
const PORT = 8919;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const stdio = (name: string): GatewayInput['upstreams'][number]['transport'] => ({
  type: 'stdio',
  command: process.execPath,
  args: [MOCK],
  env: { MOCK_NAME: name },
});

const config = {
  port: PORT,
  // 用例显式触发对账，避免定时器带来的时序干扰
  reconcileIntervalMs: 3_600_000,
  endpoints: [{ path: '/mcp' }, { path: '/mcp/alpha', upstreams: ['alpha'] }],
  upstreams: [
    { id: 'alpha', alias: 'a', transport: stdio('alpha'), timeoutMs: 10_000 },
    {
      id: 'beta',
      alias: 'b',
      transport: stdio('beta'),
      tools: { exclude: ['slow_*', 'mutate'] },
      timeoutMs: 10_000,
    },
    {
      id: 'broken',
      alias: 'x',
      transport: { type: 'stdio', command: 'no-such-command-12345', stderr: 'ignore' },
      timeoutMs: 3_000,
    },
  ],
} satisfies GatewayInput;

let gateway: Gateway;
let client: Client;
let scoped: Client;
let audited: string[] = [];

const audit: Middleware = async (ctx, next) => {
  const result = await next();
  audited.push(
    [
      ctx.name,
      ctx.upstreamId,
      `readOnly=${String(ctx.tool.annotations?.readOnlyHint)}`,
      `err=${String(result.isError === true)}`,
    ].join('|'),
  );
  return result;
};

const connect = async (path: string): Promise<Client> => {
  const created = new Client({ name: 'openmcp-test', version: '0.0.1' }, { capabilities: {} });
  await created.connect(new StreamableHTTPClientTransport(new URL(`${ORIGIN}${path}`)));
  return created;
};

const toolNames = async (from: Client = client): Promise<string[]> =>
  (await from.listTools()).tools.map((tool) => tool.name);

const versionOf = (path: string): number =>
  gateway.endpoints.find((endpoint) => endpoint.path === path)?.version ?? -1;

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 递归取第一段文本：接受工具结果、资源结果、prompt 消息或裸 content 节点 */
function textOf(node: unknown): string {
  if (typeof node === 'object' && node !== null) {
    if ('text' in node && typeof node.text === 'string') return node.text;
    if ('content' in node && Array.isArray(node.content)) return textOf(node.content[0]);
    if ('contents' in node && Array.isArray(node.contents)) return textOf(node.contents[0]);
  }
  throw new Error(`取不到文本内容: ${JSON.stringify(node)}`);
}

beforeAll(async () => {
  gateway = await createGateway(config, { middleware: [audit] });
  client = await connect('/mcp');
  scoped = await connect('/mcp/alpha');
}, 60_000);

afterAll(async () => {
  await Promise.all([client?.close().catch(() => {}), scoped?.close().catch(() => {})]);
  await gateway?.close();
});

describe('聚合', () => {
  it('同名工具经 alias 前缀共存', async () => {
    const names = await toolNames();
    expect(names).toContain('a__echo');
    expect(names).toContain('b__echo');
  });

  it('exclude 规则生效', async () => {
    const names = await toolNames();
    expect(names).not.toContain('b__slow_query');
    expect(names).toContain('a__slow_query');
  });

  it('暴露集与排序均确定', async () => {
    expect(await toolNames()).toEqual([
      'a__boom',
      'a__echo',
      'a__mutate',
      'a__slow_query',
      'b__boom',
      'b__echo',
    ]);
  });

  it('annotations 原样透传', async () => {
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === 'a__echo')?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
  });
});

describe('多端点', () => {
  it('限定上游的端点只暴露该组工具', async () => {
    const names = await toolNames(scoped);
    expect(names.every((name) => name.startsWith('a__'))).toBe(true);
    expect(names).toHaveLength(4);
  });

  it('各端点独立计版本', () => {
    expect(gateway.endpoints.map((endpoint) => endpoint.path)).toEqual(['/mcp', '/mcp/alpha']);
    expect(versionOf('/mcp')).toBeGreaterThan(0);
  });

  it('instructions 告知客户端上游构成', () => {
    const instructions = scoped.getInstructions() ?? '';
    expect(instructions).toContain('a__* → alpha');
    expect(instructions).not.toContain('beta');
  });
});

describe('上游不可达', () => {
  it('单个上游失败不影响其余上游的暴露集', () => {
    const broken = gateway.upstreams.find((upstream) => upstream.id === 'broken');
    expect(broken?.state).toBe('unreachable');
    expect(gateway.upstreams.filter((upstream) => upstream.state === 'ready')).toHaveLength(2);
    expect(gateway.endpoints.find((endpoint) => endpoint.path === '/mcp')?.tools).toBe(6);
  });
});

describe('路由', () => {
  it('工具按 alias 落到对应上游', async () => {
    const alpha = await client.callTool({ name: 'a__echo', arguments: { text: 'hi' } });
    const beta = await client.callTool({ name: 'b__echo', arguments: { text: 'hi' } });
    expect(textOf(alpha)).toBe('alpha:hi');
    expect(textOf(beta)).toBe('beta:hi');
  });

  it('prompts 与工具走同一套命名', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toEqual(['a__greet', 'b__greet']);

    const prompt = await client.getPrompt({ name: 'b__greet' });
    expect(textOf(prompt.messages[0]?.content)).toContain('beta');
  });

  it('resources 只改显示名，URI 保持原样', async () => {
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toEqual([
      'mock://alpha/config',
      'mock://beta/config',
    ]);
    expect(resources.map((resource) => resource.name)).toEqual(['a__config', 'b__config']);
  });

  it('resources 按 URI 路由', async () => {
    expect(textOf(await client.readResource({ uri: 'mock://beta/config' }))).toContain('beta');
  });
});

describe('错误语义', () => {
  it('上游业务错误保持 isError，不升级为协议错误', async () => {
    const result = await client.callTool({ name: 'a__boom', arguments: {} });
    expect(result.isError).toBe(true);
  });

  it('未知工具与未知资源均以协议错误拒绝', async () => {
    await expect(client.callTool({ name: 'nope__tool', arguments: {} })).rejects.toThrow(/未知工具/);
    await expect(client.readResource({ uri: 'mock://nowhere/x' })).rejects.toThrow(/未知资源/);
  });
});

describe('中间件', () => {
  it('仅已解析的调用进入链路', async () => {
    audited = [];
    await client.callTool({ name: 'a__echo', arguments: { text: 'mw' } });
    await expect(client.callTool({ name: 'nope__tool', arguments: {} })).rejects.toThrow();
    expect(audited).toEqual(['a__echo|alpha|readOnly=true|err=false']);
  });

  it('可观测 isError 与 annotations', async () => {
    audited = [];
    await client.callTool({ name: 'a__boom', arguments: {} });
    expect(audited).toEqual(['a__boom|alpha|readOnly=false|err=true']);
  });
});

describe('分页', () => {
  it('拒绝指向旧快照的游标', async () => {
    const stale = Buffer.from('9999:0').toString('base64url');
    await expect(client.listTools({ cursor: stale })).rejects.toThrow(/已变更/);
  });
});

describe('变更感知', () => {
  it('契约变化才推进版本并通知，无变化的对账保持静默', async () => {
    let notifications = 0;
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      notifications++;
    });

    const before = versionOf('/mcp');

    await client.callTool({ name: 'a__mutate', arguments: {} });
    await settle(2_000);

    expect(versionOf('/mcp')).toBe(before + 1);
    expect(notifications).toBe(1);
    expect(await toolNames()).toContain('a__added_by_mutate');

    await gateway.reconcile();
    await settle(300);

    expect(versionOf('/mcp')).toBe(before + 1);
    expect(notifications).toBe(1);
  }, 30_000);
});
