import type { GatewaySpec } from './config.js';
import { Endpoint } from './endpoint.js';
import { Upstream, type UpstreamStatus } from './upstream.js';

const COALESCE_WINDOW = 500;

/** 一次热更新对挂载点的影响 */
export interface Changes {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** discovery 变了，McpServer 的注册形状随之改变 —— 既有会话必须重建 */
  readonly invalidated: readonly string[];
}

/** 推送与轮询双通道驱动对账：通知会丢，上游可能没声明 listChanged 却在变，恶意上游更会故意不发。 */
export class Reconciler {
  private readonly pool = new Map<string, Upstream>();
  private readonly mounts = new Map<string, Endpoint>();
  private ticker: NodeJS.Timeout | null = null;
  private pending: NodeJS.Timeout | null = null;
  private stale = new Set<string>();

  constructor(private spec: GatewaySpec) {
    this.absorb(spec);
  }

  get endpoints(): readonly Endpoint[] {
    return [...this.mounts.values()];
  }

  async start(): Promise<void> {
    await this.reconcile();
    this.arm();
  }

  async stop(): Promise<void> {
    if (this.ticker) clearInterval(this.ticker);
    if (this.pending) clearTimeout(this.pending);
    this.ticker = null;
    this.pending = null;
    await Promise.all([...this.pool.values()].map((upstream) => upstream.close()));
  }

  /**
   * 声明式热更新：只有连接身份变了的上游才重连，只改过滤或改名的原样留着。
   * 端点实例尽量保留 —— 重建会让版本号回退，客户端手上的游标随之错位。
   */
  async apply(spec: GatewaySpec): Promise<Changes> {
    if (spec.port !== this.spec.port) {
      throw new Error(`port 不可热更新（当前 ${this.spec.port}，传入 ${spec.port}）`);
    }

    const retired = this.absorbUpstreams(spec);
    const changes = this.absorbEndpoints(spec);
    const restart = spec.reconcileInterval !== this.spec.reconcileInterval;
    this.spec = spec;

    await Promise.allSettled(retired.map((upstream) => upstream.close()));
    if (restart && this.ticker) this.arm();
    await this.reconcile();
    return changes;
  }

  async reconcile(ids?: readonly string[]): Promise<void> {
    const targets = ids
      ? ids.flatMap((id) => {
          const upstream = this.pool.get(id);
          return upstream ? [upstream] : [];
        })
      : [...this.pool.values()];
    await Promise.allSettled(targets.map((upstream) => upstream.probe()));

    for (const endpoint of this.mounts.values()) endpoint.refresh();
  }

  statuses(): readonly UpstreamStatus[] {
    return [...this.pool.values()].map((upstream) => upstream.status);
  }

  private absorb(spec: GatewaySpec): void {
    this.absorbUpstreams(spec);
    this.absorbEndpoints(spec);
  }

  /** 返回该关掉的上游实例。真正 close 留给调用方，好把等待合并成一次。 */
  private absorbUpstreams(spec: GatewaySpec): readonly Upstream[] {
    const retired: Upstream[] = [];
    const wanted = new Set(spec.upstreams.map((upstream) => upstream.id));

    for (const [id, upstream] of this.pool) {
      if (wanted.has(id)) continue;
      this.pool.delete(id);
      retired.push(upstream);
    }

    for (const upstreamSpec of spec.upstreams) {
      const existing = this.pool.get(upstreamSpec.id);
      if (existing && existing.spec.identity === upstreamSpec.identity) {
        existing.spec = upstreamSpec;
        continue;
      }
      if (existing) retired.push(existing);

      const upstream = new Upstream(upstreamSpec);
      upstream.onContractChange = () => this.markStale(upstreamSpec.id);
      this.pool.set(upstreamSpec.id, upstream);
    }

    return retired;
  }

  private absorbEndpoints(spec: GatewaySpec): Changes {
    const added: string[] = [];
    const invalidated: string[] = [];
    const wanted = new Set(spec.endpoints.map((endpoint) => endpoint.path));
    const removed = [...this.mounts.keys()].filter((path) => !wanted.has(path));

    for (const path of removed) this.mounts.delete(path);

    for (const endpointSpec of spec.endpoints) {
      const existing = this.mounts.get(endpointSpec.path);
      if (!existing) {
        this.mounts.set(endpointSpec.path, Endpoint.build(endpointSpec, this.pool, spec));
        added.push(endpointSpec.path);
        continue;
      }
      if (existing.discovery !== endpointSpec.discovery) invalidated.push(endpointSpec.path);
      existing.adopt(endpointSpec, this.pool, spec);
    }

    return { added, removed, invalidated };
  }

  private arm(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = setInterval(() => void this.reconcile(), this.spec.reconcileInterval);
  }

  /** 合并窗口内的信号，但不因新信号顺延 —— 持续抖动的上游不该把对账饿死 */
  private markStale(id: string): void {
    this.stale.add(id);
    if (this.pending) return;

    this.pending = setTimeout(() => {
      this.pending = null;
      const ids = [...this.stale];
      this.stale.clear();
      void this.reconcile(ids);
    }, COALESCE_WINDOW);
  }
}
