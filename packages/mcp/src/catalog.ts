import { createHash } from 'node:crypto';
import type { Prompt, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { GatewaySpec } from './config.js';
import type { Upstream } from './upstream.js';

export interface Route {
  readonly upstream: Upstream;
  /** 上游侧的原始名字 */
  readonly name: string;
}

export interface ToolEntry {
  readonly tool: Tool;
  readonly route: Route;
}

export interface PromptEntry {
  readonly prompt: Prompt;
  readonly route: Route;
}

/** 不可变路由表。每轮对账构造新实例，靠 fingerprint 判断是否值得通知客户端。 */
export class Catalog {
  static readonly empty = new Catalog(new Map(), new Map(), []);

  static from(upstreams: readonly Upstream[], qualify: GatewaySpec['qualify']): Catalog {
    const tools = new Map<string, ToolEntry>();
    const prompts = new Map<string, PromptEntry>();
    const collisions: string[] = [];

    for (const upstream of upstreams) {
      const { alias, exposes } = upstream.spec;

      for (const tool of upstream.tools) {
        if (!exposes(tool.name)) continue;
        const name = qualify(alias, tool.name);
        if (tools.has(name)) collisions.push(name);
        else tools.set(name, { tool: { ...tool, name }, route: { upstream, name: tool.name } });
      }

      for (const prompt of upstream.prompts) {
        const name = qualify(alias, prompt.name);
        if (prompts.has(name)) collisions.push(name);
        else
          prompts.set(name, { prompt: { ...prompt, name }, route: { upstream, name: prompt.name } });
      }
    }

    return new Catalog(sortByKey(tools), sortByKey(prompts), collisions);
  }

  readonly fingerprint: string;
  /** 已按名字排序，顺序稳定才能保住客户端缓存与 LLM prompt cache */
  readonly tools: readonly Tool[];
  readonly prompts: readonly Prompt[];

  private constructor(
    private readonly toolEntries: ReadonlyMap<string, ToolEntry>,
    private readonly promptEntries: ReadonlyMap<string, PromptEntry>,
    readonly collisions: readonly string[],
  ) {
    this.tools = [...toolEntries.values()].map((entry) => entry.tool);
    this.prompts = [...promptEntries.values()].map((entry) => entry.prompt);
    this.fingerprint = fingerprint(this.tools, this.prompts);
  }

  tool(name: string): ToolEntry | undefined {
    return this.toolEntries.get(name);
  }

  prompt(name: string): PromptEntry | undefined {
    return this.promptEntries.get(name);
  }
}

const sortByKey = <T>(entries: ReadonlyMap<string, T>): ReadonlyMap<string, T> =>
  new Map([...entries].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));

/** annotations 参与计算：destructiveHint 由 true 改 false 是契约变更，不是外观变更 */
function fingerprint(tools: readonly Tool[], prompts: readonly Prompt[]): string {
  const hash = createHash('sha256');
  for (const tool of tools) {
    hash.update(tool.name);
    hash.update(
      JSON.stringify([tool.description, tool.inputSchema, tool.outputSchema, tool.annotations]),
    );
  }
  for (const prompt of prompts) hash.update(prompt.name);
  return hash.digest('hex');
}
