import { Catalog } from './catalog.js';
import type { Discovery, EndpointSpec, GatewaySpec } from './config.js';
import type { Upstream } from './upstream.js';

export interface Snapshot {
  readonly catalog: Catalog;
  readonly version: number;
}

/** 命名规则来自网关全局，各端点共用 —— 同一个工具在不同端点该有同一个名字 */
export type Naming = Pick<GatewaySpec, 'qualify' | 'disambiguate' | 'duplicates'>;

const noop = (): void => {};

/**
 * 一个对外挂载点：一组上游的视图。
 * 各挂载点独立计算指纹与版本，某组没变就不会被别组的变更惊动。
 */
export class Endpoint {
  snapshot: Snapshot = { catalog: Catalog.empty, version: 0 };
  onChange: () => void = noop;

  constructor(
    private spec: EndpointSpec,
    private upstreams: readonly Upstream[],
    private naming: Naming,
  ) {}

  static build(spec: EndpointSpec, pool: ReadonlyMap<string, Upstream>, naming: Naming): Endpoint {
    return new Endpoint(spec, resolve(spec, pool), naming);
  }

  /**
   * 热更新时换掉配置但保留实例：version 得以延续，客户端手上的游标不会凭空错位。
   * 是否值得通知客户端交给下一轮 refresh 按指纹判断。
   */
  adopt(spec: EndpointSpec, pool: ReadonlyMap<string, Upstream>, naming: Naming): void {
    this.spec = spec;
    this.upstreams = resolve(spec, pool);
    this.naming = naming;
  }

  get path(): string {
    return this.spec.path;
  }

  get discovery(): Discovery {
    return this.spec.discovery;
  }

  /** 撞过车的名字。只写日志运维看不见，因此同时挂到 /healthz。 */
  get collisions(): readonly string[] {
    return this.snapshot.catalog.collisions;
  }

  refresh(): void {
    const catalog = Catalog.from(this.upstreams, { ...this.naming, decorate: this.spec.decorate });
    if (catalog.fingerprint === this.snapshot.catalog.fingerprint) return;

    this.snapshot = { catalog, version: this.snapshot.version + 1 };
    if (catalog.collisions.length > 0) {
      const disposal = this.naming.duplicates === 'reject' ? '已丢弃' : '已改名';
      console.warn(`[openmcp] ${this.path} 命名冲突${disposal}: ${catalog.collisions.join(', ')}`);
    }
    this.onChange();
  }

  /** 握手时交给模型：前缀解决了「哪一组」，这里补上「这组是什么」与如何取用 */
  get instructions(): string {
    const sources = this.upstreams.map((upstream) => {
      const { alias, id } = upstream.spec;
      const detail =
        upstream.state === 'ready' ? `${upstream.tools.length} 个工具` : '当前不可达，其工具暂不可用';
      return `  ${this.naming.qualify(alias, '*')} → ${id}（${detail}）`;
    });

    const workflow =
      this.discovery === 'progressive'
        ? ['', '工具未直接列出：先 search_tools 检索，再 describe_tool 取参数定义，最后 call_tool 执行。']
        : [];

    return ['本网关聚合以下上游，工具名前缀标识来源：', ...sources, ...workflow].join('\n');
  }
}

function resolve(spec: EndpointSpec, pool: ReadonlyMap<string, Upstream>): readonly Upstream[] {
  return spec.upstreams.map((upstreamSpec) => {
    const upstream = pool.get(upstreamSpec.id);
    if (!upstream) throw new Error(`端点 ${spec.path} 缺少上游实例: ${upstreamSpec.id}`);
    return upstream;
  });
}
