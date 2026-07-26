import express, { type Request, type RequestHandler, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GatewaySpec } from './config.js';
import type { Reconciler } from './reconciler.js';

const SESSION_HEADER = 'mcp-session-id';
const noop = (): void => {};

export function serve(
  spec: GatewaySpec,
  reconciler: Reconciler,
  createServer: () => McpServer,
): HttpServer {
  const sessions = new SessionPool(createServer);
  reconciler.onChange = () => sessions.announceListChanged();

  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use(originGuard(spec.allowsOrigin));

  app.post(spec.path, (req, res) => void sessions.dispatch(req, res));
  app.get(spec.path, (req, res) => void sessions.forward(req, res));
  app.delete(spec.path, (req, res) => void sessions.forward(req, res));

  app.get('/healthz', (_req, res) => {
    const { catalog, version } = reconciler.snapshot;
    res.json({
      version,
      tools: catalog.tools.length,
      sessions: sessions.size,
      upstreams: reconciler.statuses(),
    });
  });

  return app.listen(spec.port, () =>
    console.log(`[openmcp] http://localhost:${spec.port}${spec.path}`),
  );
}

interface Session {
  readonly server: McpServer;
  readonly transport: StreamableHTTPServerTransport;
}

/** 每个 MCP 会话独占一个 McpServer 实例（SDK 的要求），共享同一个 Reconciler。 */
class SessionPool {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly createServer: () => McpServer) {}

  get size(): number {
    return this.sessions.size;
  }

  async dispatch(req: Request, res: Response): Promise<void> {
    const id = req.header(SESSION_HEADER);
    if (id === undefined) return this.establish(req, res);

    const session = this.sessions.get(id);
    if (!session) return expired(res);
    await session.transport.handleRequest(req, res, req.body);
  }

  /** GET 拉服务端推送流，DELETE 主动终止会话，两者都要求会话已存在 */
  async forward(req: Request, res: Response): Promise<void> {
    const session = this.sessions.get(req.header(SESSION_HEADER) ?? '');
    if (!session) return expired(res);
    await session.transport.handleRequest(req, res);
  }

  announceListChanged(): void {
    for (const { server } of this.sessions.values()) {
      server.sendToolListChanged();
      server.sendPromptListChanged();
    }
  }

  private async establish(req: Request, res: Response): Promise<void> {
    const server = this.createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });

    transport.onclose = () => {
      if (transport.sessionId) this.sessions.delete(transport.sessionId);
      void server.close().catch(noop);
    };

    await server.connect(transport);
    // sessionId 由 initialize 的处理过程产生，因此登记必须在 handleRequest 之后
    await transport.handleRequest(req, res, req.body);
    if (transport.sessionId) this.sessions.set(transport.sessionId, { server, transport });
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
