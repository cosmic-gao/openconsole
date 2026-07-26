import { Catalog } from './catalog.js';
import type { EndpointSpec, GatewaySpec } from './config.js';
import type { Upstream } from './upstream.js';

export interface Snapshot {
  readonly catalog: Catalog;
  readonly version: number;
}

const noop = (): void => {};

/**
 * 一个对外挂载点：一组上游的视图。
 * 各挂载点独立计算指纹与版本，某组没变就不会被别组的变更惊动。
 */
export class Endpoint {
  snapshot: Snapshot = { catalog: Catalog.empty, version: 0 };
  onChange: () => void = noop;

  constructor(
    readonly path: string,
    private readonly upstreams: readonly Upstream[],
    private readonly qualify: GatewaySpec['qualify'],
  ) {}

  static build(spec: EndpointSpec, pool: ReadonlyMap<string, Upstream>, qualify: GatewaySpec['qualify']): Endpoint {
    const upstreams = spec.upstreams.map((upstreamSpec) => {
      const upstream = pool.get(upstreamSpec.id);
      if (!upstream) throw new Error(`端点 ${spec.path} 缺少上游实例: ${upstreamSpec.id}`);
      return upstream;
    });
    return new Endpoint(spec.path, upstreams, qualify);
  }

  refresh(): void {
    const catalog = Catalog.from(this.upstreams, this.qualify);
    if (catalog.fingerprint === this.snapshot.catalog.fingerprint) return;

    this.snapshot = { catalog, version: this.snapshot.version + 1 };
    if (catalog.collisions.length > 0) {
      console.warn(`[openmcp] ${this.path} 命名冲突已跳过: ${catalog.collisions.join(', ')}`);
    }
    this.onChange();
  }

  /** 握手时交给模型：前缀解决了「哪一组」，这里补上「这组是什么」 */
  get instructions(): string {
    const lines = this.upstreams.map((upstream) => {
      const { alias, id } = upstream.spec;
      const detail =
        upstream.state === 'ready' ? `${upstream.tools.length} 个工具` : '当前不可达，其工具暂不可用';
      return `  ${this.qualify(alias, '*')} → ${id}（${detail}）`;
    });
    return ['本网关聚合以下上游，工具名前缀标识来源：', ...lines].join('\n');
  }
}
