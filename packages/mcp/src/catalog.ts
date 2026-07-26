import { createHash } from 'node:crypto';
import type { Prompt, Resource, ResourceTemplate, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Duplicates, EndpointSpec, GatewaySpec } from './config.js';
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

/** 解析到的资源。target 是该发给上游的 URI —— 与对外 URI 未必相同。 */
export interface ResourceHit {
  readonly definition: Resource | ResourceTemplate;
  readonly route: Route;
  readonly target: string;
}

export interface CatalogOptions {
  readonly qualify: GatewaySpec['qualify'];
  readonly disambiguate: GatewaySpec['disambiguate'];
  readonly duplicates: Duplicates;
  readonly decorate: EndpointSpec['decorate'];
}

/** 改名的尝试上限。撞到这个数说明配置本身有问题，再试也只是掩盖。 */
const ATTEMPTS = 16;

/** 不可变路由表。每轮对账构造新实例，靠 fingerprint 判断是否值得通知客户端。 */
export class Catalog {
  static readonly empty = new Catalog(new Map(), new Map(), new Map(), [], []);

  static from(upstreams: readonly Upstream[], options: CatalogOptions): Catalog {
    const { qualify, disambiguate, duplicates, decorate } = options;
    const tools = new Map<string, Entry<Tool>>();
    const prompts = new Map<string, Entry<Prompt>>();
    const resources = new Map<string, Entry<Resource>>();
    const templates: Entry<ResourceTemplate>[] = [];
    const collisions: string[] = [];

    /**
     * 撞车时改名保留而非丢弃：少一个工具，模型就再也找不到那个能力。
     * relabel 返回 undefined 表示无从改名，此时才真正放弃。
     */
    const claim = <T>(
      index: Map<string, Entry<T>>,
      key: string,
      build: (key: string) => Entry<T>,
      relabel: (ordinal: number) => string | undefined,
    ): void => {
      if (!index.has(key)) {
        index.set(key, build(key));
        return;
      }

      collisions.push(key);
      if (duplicates === 'reject') return;

      for (let ordinal = 2; ordinal <= ATTEMPTS; ordinal++) {
        const candidate = relabel(ordinal);
        if (candidate === undefined) return;
        if (!index.has(candidate)) {
          index.set(candidate, build(candidate));
          return;
        }
      }
    };

    for (const upstream of upstreams) {
      const { alias, exposes, hideWhenUnreachable } = upstream.spec;
      // 配了 hide 就整体撤下，模型不会反复尝试一个已知打不通的上游
      if (hideWhenUnreachable && upstream.state === 'unreachable') continue;
      const named = (name: string): Route => ({ upstream, name });

      for (const tool of upstream.tools) {
        if (!exposes(tool.name)) continue;
        const decorated = decorate({ ...tool, name: qualify(alias, tool.name) });
        claim(
          tools,
          decorated.name,
          (name) => ({ definition: { ...decorated, name }, route: named(tool.name) }),
          (ordinal) => disambiguate(decorated.name, ordinal),
        );
      }

      for (const prompt of upstream.prompts) {
        const qualified = qualify(alias, prompt.name);
        claim(
          prompts,
          qualified,
          (name) => ({ definition: { ...prompt, name }, route: named(prompt.name) }),
          (ordinal) => disambiguate(qualified, ordinal),
        );
      }

      /**
       * URI 是资源的身份，改写会让工具结果里的 resource_link 失配 —— 所以默认只改显示名。
       * 只有两个上游给出同一个 URI 时才加 alias 前缀（agentgateway 的 `service+uri` 形式）：
       * 那一个资源的 resource_link 会失配，但另一个选择是它彻底不可达。
       */
      for (const resource of upstream.resources) {
        claim(
          resources,
          resource.uri,
          (uri) => ({
            definition: { ...resource, uri, name: qualify(alias, resource.name) },
            route: named(resource.uri),
          }),
          (ordinal) => (ordinal === 2 ? `${alias}+${resource.uri}` : undefined),
        );
      }

      for (const template of upstream.templates) {
        templates.push({
          definition: { ...template, name: qualify(alias, template.name) },
          route: named(template.uriTemplate),
        });
      }
    }

    // 按字面前缀由长到短，读取时命中最具体的那个模板
    templates.sort(
      (left, right) =>
        literalPrefix(right.route.name).length - literalPrefix(left.route.name).length,
    );

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

  /** 精确 URI 优先；未命中时回落到字面前缀最长的模板，避免逐个上游试探 */
  resource(uri: string): ResourceHit | undefined {
    const exact = this.resourceIndex.get(uri);
    // 命中精确资源时发原始 URI：对外 URI 可能因撞车带了 alias 前缀，上游不认
    if (exact) return { ...exact, target: exact.route.name };

    const template = this.templateEntries.find((entry) =>
      uri.startsWith(literalPrefix(entry.route.name)),
    );
    return template ? { ...template, target: uri } : undefined;
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
  for (const prompt of catalog.prompts) {
    hash.update(prompt.name);
    hash.update(JSON.stringify([prompt.description, prompt.arguments]));
  }
  for (const resource of catalog.resources) {
    hash.update(resource.uri);
    hash.update(JSON.stringify([resource.name, resource.description, resource.mimeType]));
  }
  for (const template of catalog.resourceTemplates) {
    hash.update(template.uriTemplate);
    hash.update(JSON.stringify([template.name, template.description]));
  }
  return hash.digest('hex');
}
