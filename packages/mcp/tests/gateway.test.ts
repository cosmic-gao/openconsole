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

interface Health {
  version: number;
  tools: number;
  upstreams: { id: string; state: string; failure: string | null }[];
}

const config = {
  port: PORT,
  // 用例显式触发对账，避免定时器带来的时序干扰
  reconcileIntervalMs: 3_600_000,
  upstreams: [
    {
      id: 'alpha',
      alias: 'a',
      transport: {
        type: 'stdio',
        command: process.execPath,
        args: [MOCK],
        env: { MOCK_NAME: 'alpha' },
      },
      timeoutMs: 10_000,
    },
    {
      id: 'beta',
      alias: 'b',
      transport: {
        type: 'stdio',
        command: process.execPath,
        args: [MOCK],
        env: { MOCK_NAME: 'beta' },
      },
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

const listToolNames = async (): Promise<string[]> =>
  (await client.listTools()).tools.map((tool) => tool.name);

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  gateway = await createGateway(config, [audit]);
  client = new Client({ name: 'openmcp-test', version: '0.0.1' }, { capabilities: {} });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`)));
}, 60_000);

afterAll(async () => {
  await client?.close().catch(() => {});
  await gateway?.close();
});

describe('聚合', () => {
  it('同名工具经 alias 前缀共存', async () => {
    const names = await listToolNames();
    expect(names).toContain('a__echo');
    expect(names).toContain('b__echo');
  });

  it('exclude 规则生效', async () => {
    const names = await listToolNames();
    expect(names).not.toContain('b__slow_query');
    expect(names).toContain('a__slow_query');
  });

  it('暴露集与排序均确定', async () => {
    expect(await listToolNames()).toEqual([
      'a__boom',
      'a__echo',
      'a__mutate',
      'a__slow_query',
      'b__boom',
      'b__echo',
    ]);
  });

  it('annotations 原样透传', async () => {
    const tools = await client.listTools();
    expect(tools.tools.find((tool) => tool.name === 'a__echo')?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
  });
});

describe('上游不可达', () => {
  it('单个上游失败不影响其余上游的暴露集', async () => {
    const health = (await fetch(`${ORIGIN}/healthz`).then((res) => res.json())) as Health;
    expect(health.upstreams.find((upstream) => upstream.id === 'broken')?.state).toBe('unreachable');
    expect(health.upstreams.filter((upstream) => upstream.state === 'ready')).toHaveLength(2);
    expect(health.tools).toBe(6);
  });
});

describe('路由', () => {
  it('按 alias 落到对应上游', async () => {
    const alpha = (await client.callTool({ name: 'a__echo', arguments: { text: 'hi' } })) as {
      content: { text?: string }[];
    };
    const beta = (await client.callTool({ name: 'b__echo', arguments: { text: 'hi' } })) as {
      content: { text?: string }[];
    };
    expect(alpha.content[0]?.text).toBe('alpha:hi');
    expect(beta.content[0]?.text).toBe('beta:hi');
  });

  it('prompts 与工具走同一套命名', async () => {
    const names = (await client.listPrompts()).prompts.map((prompt) => prompt.name);
    expect(names).toEqual(['a__greet', 'b__greet']);

    const prompt = (await client.getPrompt({ name: 'b__greet' })) as {
      messages: { content: { text?: string } }[];
    };
    expect(prompt.messages[0]?.content.text).toContain('beta');
  });
});

describe('错误语义', () => {
  it('上游业务错误保持 isError，不升级为协议错误', async () => {
    const result = (await client.callTool({ name: 'a__boom', arguments: {} })) as {
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
  });

  it('未知工具以协议错误拒绝', async () => {
    await expect(client.callTool({ name: 'nope__tool', arguments: {} })).rejects.toThrow(/未知工具/);
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

    const before = gateway.version;

    await client.callTool({ name: 'a__mutate', arguments: {} });
    await settle(2_000);

    expect(gateway.version).toBe(before + 1);
    expect(notifications).toBe(1);
    expect(await listToolNames()).toContain('a__added_by_mutate');

    await gateway.reconcile();
    await settle(300);

    expect(gateway.version).toBe(before + 1);
    expect(notifications).toBe(1);
  }, 30_000);
});
