import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  CallToolResult,
  GetPromptResult,
  ListChangedOptions,
  Prompt,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { Endpoint, UpstreamSpec } from './config.js';

export type UpstreamState = 'pending' | 'ready' | 'unreachable';

export interface UpstreamStatus {
  readonly id: string;
  readonly state: UpstreamState;
  readonly tools: number;
  readonly prompts: number;
  readonly failure: string | null;
  readonly probedAt: number | null;
}

const noop = (): void => {};

export class Upstream {
  state: UpstreamState = 'pending';
  tools: readonly Tool[] = [];
  prompts: readonly Prompt[] = [];
  onContractChange: () => void = noop;

  private failure: string | null = null;
  private probedAt: number | null = null;
  private client: Client | null = null;
  private opening: Promise<Client> | null = null;

  constructor(readonly spec: UpstreamSpec) {}

  get status(): UpstreamStatus {
    return {
      id: this.spec.id,
      state: this.state,
      tools: this.tools.length,
      prompts: this.prompts.length,
      failure: this.failure,
      probedAt: this.probedAt,
    };
  }

  /** 失败时保留上一次快照：模型该看到「工具暂时不可用」，而不是「工具不存在」 */
  async probe(): Promise<void> {
    this.probedAt = Date.now();
    try {
      const client = await this.open();
      const capabilities = client.getServerCapabilities() ?? {};
      this.tools = capabilities.tools
        ? (await this.paginate((cursor) => client.listTools({ cursor }, this.options))).flatMap(
            (page) => page.tools,
          )
        : [];
      this.prompts = capabilities.prompts
        ? (await this.paginate((cursor) => client.listPrompts({ cursor }, this.options))).flatMap(
            (page) => page.prompts,
          )
        : [];
      this.state = 'ready';
      this.failure = null;
    } catch (error) {
      this.state = 'unreachable';
      this.failure = error instanceof Error ? error.message : String(error);
      this.client = null;
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown> | undefined,
    signal: AbortSignal,
  ): Promise<CallToolResult> {
    const client = await this.open();
    const result = await client.callTool({ name, arguments: args }, undefined, {
      ...this.options,
      signal,
    });
    return result as CallToolResult;
  }

  async getPrompt(name: string, args: Record<string, string> | undefined): Promise<GetPromptResult> {
    const client = await this.open();
    return client.getPrompt({ name, arguments: args });
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    await client?.close().catch(noop);
  }

  private get options(): { timeout: number } {
    return { timeout: this.spec.timeout };
  }

  private async open(): Promise<Client> {
    if (this.client) return this.client;
    this.opening ??= this.dial().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  private async dial(): Promise<Client> {
    const client = new Client(
      { name: 'openmcp', version: '0.0.1' },
      {
        capabilities: {},
        listChanged: { tools: this.signalContractChange(), prompts: this.signalContractChange() },
      },
    );
    await client.connect(transportFor(this.spec.endpoint));

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

  private async paginate<P extends { nextCursor?: string | undefined }>(
    fetch: (cursor: string | undefined) => Promise<P>,
  ): Promise<P[]> {
    const pages: P[] = [];
    let cursor: string | undefined;
    do {
      const page = await fetch(cursor);
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor);
    return pages;
  }
}

const transportFor = (endpoint: Endpoint): StdioClientTransport | StreamableHTTPClientTransport =>
  endpoint.kind === 'stdio'
    ? new StdioClientTransport(endpoint.params)
    : new StreamableHTTPClientTransport(endpoint.url, { requestInit: endpoint.init });
