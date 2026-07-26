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
  readonly collisions: readonly string[];
}

export interface Serving {
  readonly listener: HttpServer;
  endpoints(): readonly EndpointStatus[];
  /** 让挂载表追上当前端点集合。invalidated 的端点会清空既有会话。 */
  sync(spec: GatewaySpec, endpoints: readonly Endpoint[], invalidated?: readonly string[]): Promise<void>;
}

interface Mount {
  readonly endpoint: Endpoint;
  readonly pool: SessionPool;
}

const SESSION_HEADER = 'mcp-session-id';
const noop = (): void => {};

export function serve(
  spec: GatewaySpec,
  reconciler: Reconciler,
  createServer: (endpoint: Endpoint) => McpServer,
  auth?: AuthOptions,
): Serving {
  // 端点与限额都可热更新，因此一律经这个引用读取，而不是在闭包里定死
  let active = spec;
  const mounts = new Map<string, Mount>();
  const guard: RequestHandler | undefined = auth ? requireBearerAuth(auth) : undefined;

  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use((req, res, next) => {
    const origin = req.header('origin');
    if (origin !== undefined && !active.allowsOrigin(origin)) {
      res.status(403).json(rpcError(-32000, `Origin 不被允许: ${origin}`));
      return;
    }
    next();
  });

  const endpoints = (): readonly EndpointStatus[] =>
    [...mounts.values()].map(({ endpoint, pool }) => ({
      path: endpoint.path,
      version: endpoint.snapshot.version,
      tools: endpoint.snapshot.catalog.tools.length,
      sessions: pool.size,
      collisions: endpoint.collisions,
    }));

  app.get('/healthz', (_req, res) => {
    res.json({ endpoints: endpoints(), upstreams: reconciler.statuses() });
  });

  // 挂载表可变，只能按路径查表分派 —— Express 没有卸载已注册路由的手段
  app.use((req, res, next) => {
    const mount = mounts.get(req.path);
    if (!mount) return next();

    const handle = (): void => {
      // GET 拉服务端推送流，DELETE 主动终止会话，两者都要求会话已存在
      if (req.method === 'POST') void mount.pool.dispatch(req, res);
      else if (req.method === 'GET' || req.method === 'DELETE') void mount.pool.forward(req, res);
      else res.status(405).json(rpcError(-32000, `不支持的方法: ${req.method}`));
    };

    if (guard) guard(req, res, handle);
    else handle();
  });

  const sync = async (
    next: GatewaySpec,
    current: readonly Endpoint[],
    invalidated: readonly string[] = [],
  ): Promise<void> => {
    active = next;
    const wanted = new Set(current.map((endpoint) => endpoint.path));
    const draining: Promise<void>[] = [];

    for (const [path, mount] of mounts) {
      if (wanted.has(path)) continue;
      mounts.delete(path);
      draining.push(mount.pool.drain());
    }

    for (const endpoint of current) {
      const existing = mounts.get(endpoint.path);
      if (existing) {
        if (invalidated.includes(endpoint.path)) draining.push(existing.pool.drain());
        continue;
      }
      const pool = new SessionPool(() => createServer(endpoint), () => active.sessions);
      endpoint.onChange = () => pool.announceListChanged();
      mounts.set(endpoint.path, { endpoint, pool });
    }

    await Promise.all(draining);
  };

  // 首轮没有会话可清，同步部分即刻生效
  void sync(spec, reconciler.endpoints);

  const listener = app.listen(spec.port, () => {
    for (const path of mounts.keys()) {
      console.log(`[openmcp] http://localhost:${spec.port}${path}`);
    }
  });

  return { listener, endpoints, sync };
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
    private readonly limits: () => SessionLimits,
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

  /** 端点被卸载或换了发现模式：既有会话握的是旧形状的 McpServer，只能让它们重连 */
  async drain(): Promise<void> {
    const closing = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.allSettled(closing.map((session) => session.server.close()));
  }

  private async establish(req: Request, res: Response): Promise<void> {
    this.evictIdle();
    if (this.sessions.size >= this.limits().max) {
      res.status(503).json(rpcError(-32000, '会话数已达上限'));
      return;
    }

    const server = this.createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });

    // 从表里摘除成功才继续关 server：server.close() 会回头触发 onclose，
    // 不设这道闸就是 close → onclose → close 的无限递归。
    transport.onclose = () => {
      const id = transport.sessionId;
      if (id !== undefined && this.sessions.delete(id)) void server.close().catch(noop);
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
    const deadline = Date.now() - this.limits().idleMs;
    for (const [id, session] of this.sessions) {
      if (session.lastSeen >= deadline) continue;
      this.sessions.delete(id);
      void session.server.close().catch(noop);
    }
  }
}

const expired = (res: Response): void => {
  res.status(404).json(rpcError(-32001, '会话不存在或已过期'));
};

const rpcError = (code: number, message: string) => ({
  jsonrpc: '2.0',
  error: { code, message },
  id: null,
});
