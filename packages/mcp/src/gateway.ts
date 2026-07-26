import { defineGateway, type GatewayInput } from './config.js';
import { createMcpServer, type Middleware } from './handlers.js';
import { serve, type AuthOptions, type EndpointStatus } from './http.js';
import { Reconciler } from './reconciler.js';
import type { UpstreamStatus } from './upstream.js';

export interface GatewayOptions {
  middleware?: readonly Middleware[];
  /** 省略即不鉴权。verifier 由调用方提供，网关只负责接线。 */
  auth?: AuthOptions;
}

export interface Gateway {
  readonly port: number;
  readonly endpoints: readonly EndpointStatus[];
  readonly upstreams: readonly UpstreamStatus[];
  /** 立即执行一轮对账，不等定时器 */
  reconcile(): Promise<void>;
  close(): Promise<void>;
}

export async function createGateway(
  input: GatewayInput,
  options: GatewayOptions = {},
): Promise<Gateway> {
  const spec = defineGateway(input);
  const reconciler = new Reconciler(spec);
  await reconciler.start();

  const { listener, endpoints } = serve(
    spec,
    reconciler,
    (endpoint) => createMcpServer(spec, endpoint, options.middleware ?? []),
    options.auth,
  );

  return {
    port: spec.port,
    get endpoints() {
      return endpoints();
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
