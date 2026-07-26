import express, { type Request, type RequestHandler, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GatewaySpec, SessionLimits } from './config.js';
import type { Endpoint } from './endpoint.js';
import type { Reconciler } from './reconciler.js';

export interface AuthOptions {
  verifier: OAuthTokenVerifier;
  requiredScopes?: string[];
  /** 401 响应的 WWW-Authenticate 头里回指的 OAuth Protected Resource Metadata 地址 */
  resourceMetadataUrl?: string;
}

export interface EndpointStatus {
  readonly path: string;
  readonly version: number;
  readonly tools: number;
  readonly sessions: number;
}

export interface Serving {
  readonly listener: HttpServer;
  endpoints(): readonly EndpointStatus[];
}

const SESSION_HEADER = 'mcp-session-id';
const noop = (): void => {};

export function serve(
  spec: GatewaySpec,
  reconciler: Reconciler,
  createServer: (endpoint: Endpoint) => McpServer,
  auth?: AuthOptions,
): Serving {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use(originGuard(spec.allowsOrigin));

  const guard: RequestHandler[] = auth ? [requireBearerAuth(auth)] : [];

  const mounted = reconciler.endpoints.map((endpoint) => {
    const pool = new SessionPool(() => createServer(endpoint), spec.sessions);
    endpoint.onChange = () => pool.announceListChanged();

    app.post(endpoint.path, ...guard, (req, res) => void pool.dispatch(req, res));
    app.get(endpoint.path, ...guard, (req, res) => void pool.forward(req, res));
    app.delete(endpoint.path, ...guard, (req, res) => void pool.forward(req, res));

    return { endpoint, pool };
  });

  const endpoints = (): readonly EndpointStatus[] =>
    mounted.map(({ endpoint, pool }) => ({
      path: endpoint.path,
      version: endpoint.snapshot.version,
      tools: endpoint.snapshot.catalog.tools.length,
      sessions: pool.size,
    }));

  app.get('/healthz', (_req, res) => {
    res.json({ endpoints: endpoints(), upstreams: reconciler.statuses() });
  });

  const listener = app.listen(spec.port, () => {
    for (const { endpoint } of mounted) {
      console.log(`[openmcp] http://localhost:${spec.port}${endpoint.path}`);
    }
  });

  return { listener, endpoints };
}

interface Session {
  readonly server: McpServer;
  readonly transport: StreamableHTTPServerTransport;
  lastSeen: number;
}

/** 每个 MCP 会话独占一个 McpServer 实例（SDK 的要求），共享同一个 Endpoint 快照。 */
class SessionPool {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly createServer: () => McpServer,
    private readonly limits: SessionLimits,
  ) {}

  get size(): number {
    return this.sessions.size;
  }

  async dispatch(req: Request, res: Response): Promise<void> {
    const id = req.header(SESSION_HEADER);
    if (id === undefined) return this.establish(req, res);

    const session = this.sessions.get(id);
    if (!session) return expired(res);
    session.lastSeen = Date.now();
    await session.transport.handleRequest(req, res, req.body);
  }

  /** GET 拉服务端推送流，DELETE 主动终止会话，两者都要求会话已存在 */
  async forward(req: Request, res: Response): Promise<void> {
    const session = this.sessions.get(req.header(SESSION_HEADER) ?? '');
    if (!session) return expired(res);
    session.lastSeen = Date.now();
    await session.transport.handleRequest(req, res);
  }

  announceListChanged(): void {
    for (const { server } of this.sessions.values()) {
      server.sendToolListChanged();
      server.sendPromptListChanged();
      server.sendResourceListChanged();
    }
  }

  private async establish(req: Request, res: Response): Promise<void> {
    this.evictIdle();
    if (this.sessions.size >= this.limits.max) {
      res.status(503).json(rpcError(-32000, '会话数已达上限'));
      return;
    }

    const server = this.createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });

    transport.onclose = () => {
      if (transport.sessionId) this.sessions.delete(transport.sessionId);
      void server.close().catch(noop);
    };

    await server.connect(transport);
    // sessionId 由 initialize 的处理过程产生，因此登记必须在 handleRequest 之后
    await transport.handleRequest(req, res, req.body);
    if (transport.sessionId) {
      this.sessions.set(transport.sessionId, { server, transport, lastSeen: Date.now() });
    }
  }

  /** 客户端可能既不发 DELETE 也不断开，靠 onclose 回收不住 */
  private evictIdle(): void {
    const deadline = Date.now() - this.limits.idleMs;
    for (const [id, session] of this.sessions) {
      if (session.lastSeen >= deadline) continue;
      this.sessions.delete(id);
      void session.server.close().catch(noop);
    }
  }
}

const originGuard =
  (allows: (origin: string) => boolean): RequestHandler =>
  (req, res, next) => {
    const origin = req.header('origin');
    if (origin !== undefined && !allows(origin)) {
      res.status(403).json(rpcError(-32000, `Origin 不被允许: ${origin}`));
      return;
    }
    next();
  };

const expired = (res: Response): void => {
  res.status(404).json(rpcError(-32001, '会话不存在或已过期'));
};

const rpcError = (code: number, message: string) => ({
  jsonrpc: '2.0',
  error: { code, message },
  id: null,
});
