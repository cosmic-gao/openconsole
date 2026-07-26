import { defineGateway, type GatewayInput } from './config.js';
import { createMcpServer, type Middleware, type Visibility } from './handlers.js';
import { serve, type AuthOptions, type EndpointStatus } from './http.js';
import { Reconciler } from './reconciler.js';
import type { UpstreamStatus } from './upstream.js';

export interface GatewayOptions {
  middleware?: readonly Middleware[];
  /** 按调用者裁剪工具列表。省略即所有调用者看到同一份。 */
  visibility?: Visibility;
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
    (endpoint) =>
      createMcpServer(spec, endpoint, {
        middleware: options.middleware ?? [],
        visibility: options.visibility,
      }),
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
      // 只调 close() 会等所有连接自然结束，而 SSE 是长连接 —— 收到 SIGTERM 的进程会一直挂着
      await new Promise<void>((resolve) => {
        listener.close(() => resolve());
        listener.closeAllConnections();
      });
      await reconciler.stop();
    },
  };
}
