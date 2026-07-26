import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type {
  CallToolResult,
  GetPromptResult,
  ListChangedOptions,
  Prompt,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { Connection, UpstreamSpec } from './config.js';

export type UpstreamState = 'pending' | 'ready' | 'unreachable';

export interface UpstreamStatus {
  readonly id: string;
  readonly state: UpstreamState;
  readonly tools: number;
  readonly prompts: number;
  readonly resources: number;
  readonly breakerOpen: boolean;
  readonly failure: string | null;
  readonly probedAt: number | null;
}

const noop = (): void => {};

export class Upstream {
  state: UpstreamState = 'pending';
  tools: readonly Tool[] = [];
  prompts: readonly Prompt[] = [];
  resources: readonly Resource[] = [];
  templates: readonly ResourceTemplate[] = [];
  onContractChange: () => void = noop;

  private failure: string | null = null;
  private probedAt: number | null = null;
  private failures = 0;
  private openUntil = 0;
  private client: Client | null = null;
  private opening: Promise<Client> | null = null;
  private probing: Promise<void> | null = null;

  constructor(readonly spec: UpstreamSpec) {}

  get status(): UpstreamStatus {
    return {
      id: this.spec.id,
      state: this.state,
      tools: this.tools.length,
      prompts: this.prompts.length,
      resources: this.resources.length,
      breakerOpen: this.breakerOpen,
      failure: this.failure,
      probedAt: this.probedAt,
    };
  }

  /**
   * 失败时保留上一次快照：模型该看到「工具暂时不可用」，而不是「工具不存在」。
   * 探测不受熔断拦截，成功即清零失败计数 —— 它同时充当半开探测。
   */
  async probe(): Promise<void> {
    this.probing ??= this.runProbe().finally(() => {
      this.probing = null;
    });
    return this.probing;
  }

  private async runProbe(): Promise<void> {
    this.probedAt = Date.now();
    try {
      const client = await this.open();
      const { tools, prompts, resources } = client.getServerCapabilities() ?? {};

      this.tools = tools ? await this.collect((cursor) => client.listTools({ cursor }, this.options), (page) => page.tools) : [];
      this.prompts = prompts
        ? await this.collect((cursor) => client.listPrompts({ cursor }, this.options), (page) => page.prompts)
        : [];
      this.resources = resources
        ? await this.collect((cursor) => client.listResources({ cursor }, this.options), (page) => page.resources)
        : [];
      this.templates = resources
        ? await this.collect(
            (cursor) => client.listResourceTemplates({ cursor }, this.options),
            (page) => page.resourceTemplates,
          )
        : [];

      this.state = 'ready';
      this.failure = null;
      this.failures = 0;
      this.openUntil = 0;
    } catch (error) {
      this.state = 'unreachable';
      this.failure = describeError(error);
      this.client = null;
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown> | undefined,
    signal: AbortSignal,
  ): Promise<CallToolResult> {
    return this.withBreaker(async (client) => {
      const result = await client.callTool({ name, arguments: args }, undefined, {
        ...this.options,
        signal,
      });
      return result as CallToolResult;
    });
  }

  async getPrompt(name: string, args: Record<string, string> | undefined): Promise<GetPromptResult> {
    return this.withBreaker((client) => client.getPrompt({ name, arguments: args }, this.options));
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    return this.withBreaker((client) => client.readResource({ uri }, this.options));
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    await client?.close().catch(noop);
  }

  private get breakerOpen(): boolean {
    return Date.now() < this.openUntil;
  }

  private get options(): { timeout: number } {
    return { timeout: this.spec.timeout };
  }

  /** 连续失败达到阈值即开路，把慢上游的代价挡在调用方之外 */
  private async withBreaker<T>(operation: (client: Client) => Promise<T>): Promise<T> {
    if (this.breakerOpen) {
      throw new Error(`熔断中，${Math.ceil((this.openUntil - Date.now()) / 1000)} 秒后恢复`);
    }
    try {
      const result = await operation(await this.open());
      this.failures = 0;
      return result;
    } catch (error) {
      if (isTransportFailure(error) && ++this.failures >= this.spec.breaker.failures) {
        this.openUntil = Date.now() + this.spec.breaker.resetMs;
      }
      throw error;
    }
  }

  private async open(): Promise<Client> {
    if (this.client) return this.client;
    this.opening ??= this.dial().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  private async dial(): Promise<Client> {
    const signal = this.signalContractChange();
    const client = new Client(
      { name: 'openmcp', version: '0.0.1' },
      { capabilities: {}, listChanged: { tools: signal, prompts: signal, resources: signal } },
    );
    await client.connect(transportFor(this.spec.connection));

    client.onclose = (): void => {
      this.client = null;
    };

    this.client = client;
    return client;
  }

  /** 只取信号：列表由 Reconciler 统一重拉，跨上游的变更要合并成一轮对账 */
  private signalContractChange<T>(): ListChangedOptions<T> {
    return { autoRefresh: false, debounceMs: 0, onChanged: () => this.onContractChange() };
  }

  private async collect<P extends { nextCursor?: string | undefined }, T>(
    fetch: (cursor: string | undefined) => Promise<P>,
    pick: (page: P) => T[],
  ): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await fetch(cursor);
      items.push(...pick(page));
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  }
}

export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * 只有传输层故障才该累计到熔断。
 * InvalidParams 之类的协议错误说明上游活着并在正常应答，把它计入会让
 * 客户端连续传错参数就把整个上游打下线。
 */
export const isTransportFailure = (error: unknown): boolean =>
  !(error instanceof McpError) ||
  error.code === ErrorCode.ConnectionClosed ||
  error.code === ErrorCode.RequestTimeout;

const transportFor = (connection: Connection): StdioClientTransport | StreamableHTTPClientTransport =>
  connection.kind === 'stdio'
    ? new StdioClientTransport(connection.params)
    : new StreamableHTTPClientTransport(connection.url, { requestInit: connection.init });
