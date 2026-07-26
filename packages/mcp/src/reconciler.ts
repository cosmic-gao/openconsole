import { Catalog } from './catalog.js';
import type { GatewaySpec } from './config.js';
import { Upstream, type UpstreamStatus } from './upstream.js';

export interface Snapshot {
  readonly catalog: Catalog;
  readonly version: number;
}

const DEBOUNCE = 500;
const noop = (): void => {};

/** 推送与轮询双通道驱动对账：通知会丢，上游可能没声明 listChanged 却在变，恶意上游更会故意不发。 */
export class Reconciler {
  snapshot: Snapshot = { catalog: Catalog.empty, version: 0 };
  onChange: () => void = noop;

  private readonly upstreams: readonly Upstream[];
  private ticker: NodeJS.Timeout | null = null;
  private pending: NodeJS.Timeout | null = null;
  private stale = new Set<string>();

  constructor(private readonly spec: GatewaySpec) {
    this.upstreams = spec.upstreams.map((upstreamSpec) => {
      const upstream = new Upstream(upstreamSpec);
      upstream.onContractChange = () => this.markStale(upstreamSpec.id);
      return upstream;
    });
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

    const catalog = Catalog.from(this.upstreams, this.spec.qualify);
    if (catalog.fingerprint === this.snapshot.catalog.fingerprint) return;

    this.snapshot = { catalog, version: this.snapshot.version + 1 };
    if (catalog.collisions.length > 0) {
      console.warn(`[openmcp] 工具名冲突已跳过: ${catalog.collisions.join(', ')}`);
    }
    this.onChange();
  }

  statuses(): readonly UpstreamStatus[] {
    return this.upstreams.map((upstream) => upstream.status);
  }

  private markStale(id: string): void {
    this.stale.add(id);
    if (this.pending) clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      const ids = [...this.stale];
      this.stale.clear();
      void this.reconcile(ids);
    }, DEBOUNCE);
  }
}
