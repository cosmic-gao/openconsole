import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { CallContext, Middleware } from './handlers.js';
import { isTransportFailure } from './upstream.js';

export interface RetryOptions {
  /** 重试次数，不含首次调用 */
  attempts?: number;
  /** 首次退避时长，其后按 2 的幂增长 */
  backoffMs?: number;
}

/** 只重试幂等工具的传输故障：非幂等操作重放会留下重复副作用 */
export function retry({ attempts = 2, backoffMs = 200 }: RetryOptions = {}): Middleware {
  return async (ctx, next) => {
    if (!isReplayable(ctx.tool)) return next();

    for (let attempt = 0; ; attempt++) {
      try {
        return await next();
      } catch (error) {
        if (attempt >= attempts || !isTransportFailure(error)) throw error;
        await sleep(backoffMs * 2 ** attempt, ctx.signal);
      }
    }
  };
}

export interface RateLimitOptions {
  perMinute: number;
  /** 计数维度，默认按「调用方 + 工具」 */
  keyOf?: (ctx: CallContext) => string;
}

export function rateLimit({ perMinute, keyOf = byCallerAndTool }: RateLimitOptions): Middleware {
  const hits = new Map<string, number[]>();

  return (ctx, next) => {
    const key = keyOf(ctx);
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((at) => now - at < MINUTE);

    if (recent.length >= perMinute) {
      throw new McpError(ErrorCode.InvalidRequest, `超出调用频率上限（${perMinute}/分钟）: ${key}`);
    }

    recent.push(now);
    hits.set(key, recent);
    if (hits.size > KEY_CEILING) evictExpired(hits, now);
    return next();
  };
}

export interface AuditRecord {
  readonly tool: string;
  readonly upstreamId: string;
  readonly clientId: string | undefined;
  readonly readOnly: boolean;
  /** 只读调用不留参数，写操作留完整参数，否则事后无从复盘「到底改了什么」 */
  readonly args: Record<string, unknown> | undefined;
  readonly ok: boolean;
  readonly durationMs: number;
}

export function audit(write: (record: AuditRecord) => void): Middleware {
  return async (ctx, next) => {
    const startedAt = Date.now();
    const readOnly = ctx.tool.annotations?.readOnlyHint === true;
    const subject = {
      tool: ctx.name,
      upstreamId: ctx.upstreamId,
      clientId: ctx.auth?.clientId,
      readOnly,
      args: readOnly ? undefined : ctx.args,
    };

    try {
      const result = await next();
      write({ ...subject, ok: result.isError !== true, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      write({ ...subject, ok: false, durationMs: Date.now() - startedAt });
      throw error;
    }
  };
}

const MINUTE = 60_000;
const KEY_CEILING = 10_000;

const isReplayable = (tool: Tool): boolean =>
  tool.annotations?.readOnlyHint === true || tool.annotations?.idempotentHint === true;

const byCallerAndTool = (ctx: CallContext): string =>
  `${ctx.auth?.clientId ?? 'anonymous'}:${ctx.name}`;

/** 键空间随调用方增长，不清理就是一条内存泄漏 */
function evictExpired(hits: Map<string, number[]>, now: number): void {
  for (const [key, timestamps] of hits) {
    if (timestamps.every((at) => now - at >= MINUTE)) hits.delete(key);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason instanceof Error ? signal.reason : new Error('调用已取消'));
      },
      { once: true },
    );
  });
}
