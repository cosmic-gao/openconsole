import type { GatewaySpec } from './config.js';
import { Endpoint } from './endpoint.js';
import { Upstream, type UpstreamStatus } from './upstream.js';

const COALESCE_WINDOW = 500;

/** 推送与轮询双通道驱动对账：通知会丢，上游可能没声明 listChanged 却在变，恶意上游更会故意不发。 */
export class Reconciler {
  readonly endpoints: readonly Endpoint[];

  private readonly upstreams: readonly Upstream[];
  private ticker: NodeJS.Timeout | null = null;
  private pending: NodeJS.Timeout | null = null;
  private stale = new Set<string>();

  constructor(private readonly spec: GatewaySpec) {
    const pool = new Map(
      spec.upstreams.map((upstreamSpec) => {
        const upstream = new Upstream(upstreamSpec);
        upstream.onContractChange = () => this.markStale(upstreamSpec.id);
        return [upstreamSpec.id, upstream] as const;
      }),
    );
    this.upstreams = [...pool.values()];
    this.endpoints = spec.endpoints.map((endpointSpec) =>
      Endpoint.build(endpointSpec, pool, spec.qualify),
    );
  }

  async start(): Promise<void> {
    await this.reconcile();
    this.ticker = setInterval(() => void this.reconcile(), this.spec.reconcileInterval);
  }

  async stop(): Promise<void> {
    if (this.ticker) clearInterval(this.ticker);
    if (this.pending) clearTimeout(this.pending);
    await Promise.all(this.upstreams.map((upstream) => upstream.close()));
  }

  async reconcile(ids?: readonly string[]): Promise<void> {
    const targets = ids
      ? this.upstreams.filter((upstream) => ids.includes(upstream.spec.id))
      : this.upstreams;
    await Promise.allSettled(targets.map((upstream) => upstream.probe()));

    for (const endpoint of this.endpoints) endpoint.refresh();
  }

  statuses(): readonly UpstreamStatus[] {
    return this.upstreams.map((upstream) => upstream.status);
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
