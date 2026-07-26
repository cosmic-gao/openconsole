import { defineGateway, type GatewayInput } from './config.js';
import { createMcpServer, type Middleware } from './handlers.js';
import { serve } from './http.js';
import { Reconciler } from './reconciler.js';
import type { UpstreamStatus } from './upstream.js';

export interface Gateway {
  readonly port: number;
  /** 暴露集快照版本，契约变化时递增 */
  readonly version: number;
  readonly upstreams: readonly UpstreamStatus[];
  /** 立即执行一轮对账，不等定时器 */
  reconcile(): Promise<void>;
  close(): Promise<void>;
}

export async function createGateway(
  input: GatewayInput,
  middleware: readonly Middleware[] = [],
): Promise<Gateway> {
  const spec = defineGateway(input);
  const reconciler = new Reconciler(spec);
  await reconciler.start();

  const listener = serve(spec, reconciler, () => createMcpServer(spec, reconciler, middleware));

  return {
    port: spec.port,
    get version() {
      return reconciler.snapshot.version;
    },
    get upstreams() {
      return reconciler.statuses();
    },
    reconcile: () => reconciler.reconcile(),
    async close() {
      await new Promise<void>((resolve) => listener.close(() => resolve()));
      await reconciler.stop();
    },
  };
}
