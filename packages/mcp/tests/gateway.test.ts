import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ErrorCode,
  McpError,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { isTransportFailure } from '../src/upstream.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  audit,
  createGateway,
  rateLimit,
  type AuditRecord,
  type Gateway,
  type GatewayInput,
} from '../src/index.js';

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
  endpoints: [
    { path: '/mcp' },
    { path: '/mcp/alpha', upstreams: ['alpha'] },
    { path: '/mcp/lite', discovery: 'progressive' },
  ],
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
let lite: Client;
let calls: AuditRecord[] = [];

const track = audit((record) => calls.push(record));

const connect = async (url: string): Promise<Client> => {
  const created = new Client({ name: 'openmcp-test', version: '0.0.1' }, { capabilities: {} });
  await created.connect(new StreamableHTTPClientTransport(new URL(url)));
  return created;
};

const toolNames = async (from: Client = client): Promise<string[]> =>
  (await from.listTools()).tools.map((tool) => tool.name);

const versionOf = (path: string): number =>
  gateway.endpoints.find((endpoint) => endpoint.path === path)?.version ?? -1;

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 验证特定配置时另起的实例。只带一个上游，避免为无关的 mock 反复 spawn 子进程。 */
const soloConfig = (port: number): GatewayInput => ({
  port,
  reconcileIntervalMs: 3_600_000,
  endpoints: [{ path: '/mcp' }],
  upstreams: [{ id: 'alpha', alias: 'a', transport: stdio('alpha'), timeoutMs: 10_000 }],
});

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
  gateway = await createGateway(config, { middleware: [track] });
  client = await connect(`${ORIGIN}/mcp`);
  scoped = await connect(`${ORIGIN}/mcp/alpha`);
  lite = await connect(`${ORIGIN}/mcp/lite`);
}, 60_000);

afterAll(async () => {
  await Promise.all(
    [client, scoped, lite].map((connected) => connected?.close().catch(() => {})),
  );
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
    expect(gateway.endpoints.map((endpoint) => endpoint.path)).toEqual([
      '/mcp',
      '/mcp/alpha',
      '/mcp/lite',
    ]);
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
    calls = [];
    await client.callTool({ name: 'a__echo', arguments: { text: 'mw' } });
    await expect(client.callTool({ name: 'nope__tool', arguments: {} })).rejects.toThrow();
    expect(calls.map((record) => record.tool)).toEqual(['a__echo']);
  });

  it('审计记录 isError 与上游归属', async () => {
    calls = [];
    await client.callTool({ name: 'a__boom', arguments: { note: 'destructive' } });
    expect(calls[0]).toMatchObject({
      tool: 'a__boom',
      upstreamId: 'alpha',
      readOnly: false,
      ok: false,
      args: { note: 'destructive' },
    });
  });

  it('只读调用不留参数', async () => {
    calls = [];
    await client.callTool({ name: 'a__echo', arguments: { text: 'secret' } });
    expect(calls[0]).toMatchObject({ tool: 'a__echo', readOnly: true, ok: true });
    expect(calls[0]?.args).toBeUndefined();
  });
});

describe('渐进式发现', () => {
  it('只暴露元工具，按使用流程排列', async () => {
    expect(await toolNames(lite)).toEqual(['search_tools', 'describe_tool', 'call_tool']);
  });

  it('instructions 说明取用流程', () => {
    expect(lite.getInstructions() ?? '').toContain('先 search_tools 检索');
  });

  it('search_tools 按关键词命中，名字权重高于描述', async () => {
    const found = await lite.callTool({ name: 'search_tools', arguments: { query: 'echo' } });
    const matches = JSON.parse(textOf(found)) as { name: string }[];
    expect(matches[0]?.name).toMatch(/__echo$/);
  });

  it('describe_tool 给出完整参数定义', async () => {
    const described = await lite.callTool({
      name: 'describe_tool',
      arguments: { name: 'a__echo' },
    });
    const tool = JSON.parse(textOf(described)) as { inputSchema: { properties: object } };
    expect(tool.inputSchema.properties).toHaveProperty('text');
  });

  it('call_tool 复用同一条执行路径，中间件不被绕过', async () => {
    calls = [];
    const result = await lite.callTool({
      name: 'call_tool',
      arguments: { name: 'a__echo', arguments: { text: 'via-meta' } },
    });
    expect(textOf(result)).toBe('alpha:via-meta');
    expect(calls.map((record) => record.tool)).toEqual(['a__echo']);
  });

  it('元工具的参数校验拒绝坏输入', async () => {
    await expect(lite.callTool({ name: 'search_tools', arguments: {} })).rejects.toThrow(/query/);
    await expect(
      lite.callTool({ name: 'search_tools', arguments: { query: 'x', limit: 0 } }),
    ).rejects.toThrow(/limit/);
  });
});

describe('工具可见性', () => {
  it('按调用者裁剪列表', async () => {
    const isolated = await createGateway(
      soloConfig(PORT + 1),
      { visibility: (tool) => !tool.name.endsWith('__boom') },
    );
    const probe = await connect(`http://127.0.0.1:${PORT + 1}/mcp`);
    try {
      const names = (await probe.listTools()).tools.map((tool) => tool.name);
      expect(names).not.toContain('a__boom');
      expect(names).toContain('a__echo');
    } finally {
      await probe.close().catch(() => {});
      await isolated.close();
    }
  }, 60_000);
});

describe('内置中间件', () => {
  it('限流超出上限即拒绝，且是协议错误而非 isError', async () => {
    const limited = await createGateway(
      soloConfig(PORT + 2),
      { middleware: [rateLimit({ perMinute: 2 })] },
    );
    const probe = await connect(`http://127.0.0.1:${PORT + 2}/mcp`);
    try {
      await probe.callTool({ name: 'a__echo', arguments: { text: '1' } });
      await probe.callTool({ name: 'a__echo', arguments: { text: '2' } });
      await expect(probe.callTool({ name: 'a__echo', arguments: { text: '3' } })).rejects.toThrow(
        /频率上限/,
      );
    } finally {
      await probe.close().catch(() => {});
      await limited.close();
    }
  }, 60_000);

});

describe('熔断判据', () => {
  it('只有传输层故障计入，协议错误不计', () => {
    expect(isTransportFailure(new McpError(ErrorCode.ConnectionClosed, '断开'))).toBe(true);
    expect(isTransportFailure(new McpError(ErrorCode.RequestTimeout, '超时'))).toBe(true);
    expect(isTransportFailure(new Error('子进程退出'))).toBe(true);

    // 上游能返回这些，说明它活着并在正常应答 —— 客户端连续传错参数不该把上游打下线
    expect(isTransportFailure(new McpError(ErrorCode.InvalidParams, '参数不合法'))).toBe(false);
    expect(isTransportFailure(new McpError(ErrorCode.MethodNotFound, '没这个方法'))).toBe(false);
    expect(isTransportFailure(new McpError(ErrorCode.InternalError, '上游内部错误'))).toBe(false);
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
