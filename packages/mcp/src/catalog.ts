import { createHash } from 'node:crypto';
import type { Prompt, Resource, ResourceTemplate, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { GatewaySpec } from './config.js';
import type { Upstream } from './upstream.js';

export interface Route {
  readonly upstream: Upstream;
  /** 上游侧的原始名字 */
  readonly name: string;
}

export interface Entry<T> {
  readonly definition: T;
  readonly route: Route;
}

/** 不可变路由表。每轮对账构造新实例，靠 fingerprint 判断是否值得通知客户端。 */
export class Catalog {
  static readonly empty = new Catalog(new Map(), new Map(), new Map(), [], []);

  static from(upstreams: readonly Upstream[], qualify: GatewaySpec['qualify']): Catalog {
    const tools = new Map<string, Entry<Tool>>();
    const prompts = new Map<string, Entry<Prompt>>();
    const resources = new Map<string, Entry<Resource>>();
    const templates: Entry<ResourceTemplate>[] = [];
    const collisions: string[] = [];

    const claim = <T>(index: Map<string, Entry<T>>, key: string, entry: Entry<T>): void => {
      if (index.has(key)) collisions.push(key);
      else index.set(key, entry);
    };

    for (const upstream of upstreams) {
      const { alias, exposes } = upstream.spec;
      const named = (name: string): Route => ({ upstream, name });

      for (const tool of upstream.tools) {
        if (!exposes(tool.name)) continue;
        const name = qualify(alias, tool.name);
        claim(tools, name, { definition: { ...tool, name }, route: named(tool.name) });
      }

      for (const prompt of upstream.prompts) {
        const name = qualify(alias, prompt.name);
        claim(prompts, name, { definition: { ...prompt, name }, route: named(prompt.name) });
      }

      // URI 是资源的身份，改写会让工具结果里的 resource_link 失配，因此只改显示名
      for (const resource of upstream.resources) {
        const name = qualify(alias, resource.name);
        claim(resources, resource.uri, {
          definition: { ...resource, name },
          route: named(resource.uri),
        });
      }

      for (const template of upstream.templates) {
        templates.push({
          definition: { ...template, name: qualify(alias, template.name) },
          route: named(template.uriTemplate),
        });
      }
    }

    return new Catalog(
      sortByKey(tools),
      sortByKey(prompts),
      sortByKey(resources),
      templates,
      collisions,
    );
  }

  readonly fingerprint: string;
  /** 已按名字排序，顺序稳定才能保住客户端缓存与 LLM prompt cache */
  readonly tools: readonly Tool[];
  readonly prompts: readonly Prompt[];
  readonly resources: readonly Resource[];
  readonly resourceTemplates: readonly ResourceTemplate[];

  private constructor(
    private readonly toolIndex: ReadonlyMap<string, Entry<Tool>>,
    private readonly promptIndex: ReadonlyMap<string, Entry<Prompt>>,
    private readonly resourceIndex: ReadonlyMap<string, Entry<Resource>>,
    private readonly templateEntries: readonly Entry<ResourceTemplate>[],
    readonly collisions: readonly string[],
  ) {
    this.tools = [...toolIndex.values()].map((entry) => entry.definition);
    this.prompts = [...promptIndex.values()].map((entry) => entry.definition);
    this.resources = [...resourceIndex.values()].map((entry) => entry.definition);
    this.resourceTemplates = templateEntries.map((entry) => entry.definition);
    this.fingerprint = fingerprint(this);
  }

  tool(name: string): Entry<Tool> | undefined {
    return this.toolIndex.get(name);
  }

  prompt(name: string): Entry<Prompt> | undefined {
    return this.promptIndex.get(name);
  }

  /** 精确 URI 优先；未命中时回落到模板的字面前缀，避免逐个上游试探 */
  resource(uri: string): Entry<Resource> | Entry<ResourceTemplate> | undefined {
    return (
      this.resourceIndex.get(uri) ??
      this.templateEntries.find((entry) => uri.startsWith(literalPrefix(entry.route.name)))
    );
  }
}

const literalPrefix = (uriTemplate: string): string => uriTemplate.split('{')[0] ?? uriTemplate;

const sortByKey = <T>(entries: ReadonlyMap<string, Entry<T>>): ReadonlyMap<string, Entry<T>> =>
  new Map([...entries].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));

/** annotations 参与计算：destructiveHint 由 true 改 false 是契约变更，不是外观变更 */
function fingerprint(catalog: Catalog): string {
  const hash = createHash('sha256');
  for (const tool of catalog.tools) {
    hash.update(tool.name);
    hash.update(
      JSON.stringify([tool.description, tool.inputSchema, tool.outputSchema, tool.annotations]),
    );
  }
  for (const prompt of catalog.prompts) hash.update(prompt.name);
  for (const resource of catalog.resources) hash.update(resource.uri);
  for (const template of catalog.resourceTemplates) hash.update(template.uriTemplate);
  return hash.digest('hex');
}
