/**
 * 插件管线 —— 类 axios / Koa 的链式拦截器。
 *
 * {@link Plugins} 按注册顺序依次执行 `onRequest` / `onResponse` / `onError`
 * 钩子：钩子返回新的 Request/Response 即替换当前对象，返回 `void` 则保持原样。
 * `onError` 钩子抛出的异常会被吞掉但通过 `console.warn` 打印，以免遮蔽
 * 业务真正的失败原因。
 *
 * @module
 */
import type {
  Context,
  ErrorStep,
  Plugin,
  RequestStep,
  ResponseStep,
} from "./types";

/**
 * 插件容器，负责按声明顺序串联 `onRequest` / `onResponse` / `onError`。
 *
 * 由 {@link Http} 在每次 fetch 时调用，业务方一般通过 `Options.plugins` 或
 * `client.use()` 注入插件，无需直接实例化本类。
 */
export class Plugins {
  constructor(private readonly list: Plugin[] = []) {}

  /** 运行时挂载一个插件，加入到管线末尾。 */
  use(plugin: Plugin) {
    this.list.push(plugin);
  }

  /**
   * 依次执行所有 `onRequest` 钩子。
   *
   * @param step 当前请求与上下文
   * @returns 经过所有钩子改造后的 Request
   */
  async request(step: RequestStep): Promise<Request> {
    let req = step.request;
    for (const p of this.list) {
      if (!p.onRequest) continue;
      const next = await p.onRequest({ request: req, context: step.context });
      if (next instanceof Request) req = next;
    }
    return req;
  }

  /**
   * 依次执行所有 `onResponse` 钩子。
   *
   * @param step 当前请求、响应与上下文
   * @returns 经过所有钩子改造后的 Response
   */
  async response(step: ResponseStep): Promise<Response> {
    let res = step.response;
    for (const p of this.list) {
      if (!p.onResponse) continue;
      const next = await p.onResponse({
        request: step.request,
        response: res,
        context: step.context,
      });
      if (next instanceof Response) res = next;
    }
    return res;
  }

  /**
   * 依次执行所有 `onError` 钩子。
   *
   * 钩子抛错不会重新抛出（必须把原始请求错误透传给调用方），但会写一条
   * warning，便于排查插件自身的 bug。
   */
  async error(step: ErrorStep): Promise<void> {
    for (const p of this.list) {
      if (!p.onError) continue;
      try {
        await p.onError(step);
      } catch (err) {
        // 不重新抛出，以免遮蔽业务的原始错误；通过 warning 让插件 bug 可见。
        console.warn(`[nacos] plugin '${p.name}' onError threw`, err);
      }
    }
  }
}

/**
 * 构造一个插件运行上下文。{@link Http} 在每次发起请求时都会创建一个。
 *
 * @param service 逻辑服务名；直接 http(s):// 调用时为 undefined
 * @param attempt 当前重试次数，从 0 开始
 */
export function context(service?: string, attempt = 0): Context {
  return { service, attempt, startedAt: Date.now() };
}

// ============================================================================
// 内置插件
// ============================================================================

/** {@link logger} 的可选参数。 */
export interface LoggerOptions {
  /** 自定义 logger，需实现 console 的 info / warn / error 子集。 */
  logger?: Pick<Console, "info" | "warn" | "error">;
  /** 是否记录成功请求；默认 true。设为 false 只打印失败与异常。 */
  success?: boolean;
}

/**
 * 请求日志插件。
 *
 * 输出格式：`[nacos:<service>] <METHOD> <url> -> <status> (<ms>ms)`。
 *
 * @example
 * ```ts
 * plugins: [logger()]
 * plugins: [logger({ success: false })]             // 只记失败
 * plugins: [logger({ logger: pino({ name: "nacos" }) })]
 * ```
 */
export function logger(opts: LoggerOptions = {}): Plugin {
  const log = opts.logger ?? console;
  const success = opts.success ?? true;
  return {
    name: "logger",
    onResponse({ request, response, context }) {
      if (!success && response.ok) return;
      const ms = Date.now() - context.startedAt;
      const tag = `[nacos:${context.service ?? "direct"}]`;
      const line = `${tag} ${request.method} ${request.url} -> ${response.status} (${ms}ms)`;
      response.ok ? log.info(line) : log.warn(line);
    },
    onError({ request, error, context }) {
      const ms = Date.now() - context.startedAt;
      const tag = `[nacos:${context.service ?? "direct"}]`;
      log.error(`${tag} ${request.method} ${request.url} threw after ${ms}ms`, error);
    },
  };
}

/** {@link headers} 的可选参数。 */
export interface HeadersOptions {
  /** 注入到每个请求上的静态键值对。 */
  headers: Record<string, string>;
}

/**
 * 静态请求头插件。适合后台任务、cron、service-account 调用 —— 这些场景
 * 没有上游请求可供 {@link forward} 转发。
 *
 * 构造时会快照 `headers` 对象，后续修改原对象不会影响已注册的插件。
 *
 * @example
 * ```ts
 * plugins: [
 *   headers({
 *     headers: {
 *       authorization: `Bearer ${process.env.SERVICE_TOKEN}`,
 *       "x-app": "scheduler",
 *     },
 *   }),
 * ]
 * ```
 */
export function headers(opts: HeadersOptions): Plugin {
  // 构造时快照，避免调用方后续修改原 record 时静默影响已在飞的请求。
  const entries = Object.entries({ ...opts.headers });
  return {
    name: "headers",
    onRequest({ request }) {
      const next = new Request(request, {
        headers: new Headers(request.headers),
      });
      for (const [k, v] of entries) {
        next.headers.set(k, v);
      }
      return next;
    },
  };
}

/** {@link forward} 的可选参数。 */
export interface ForwardOptions {
  /**
   * 额外要跳过的请求头名（大小写不敏感），与默认的 hop-by-hop 列表合并。
   *
   * 常见用法：边缘网关注入的 `x-forwarded-*` 不应再传给下游服务。
   */
  exclude?: string[];
  /**
   * 是否仅对 `nacos://service/...` 调用生效；默认 `true`。
   *
   * 直接 `http(s)://...` 调用会跳过，避免把内部 cookie / 鉴权头泄露给
   * 第三方 host（Stripe、OpenAI 等）。仅当你确实希望所有外发请求都带上
   * 上游头时才设为 `false`。
   */
  internalOnly?: boolean;
}

/**
 * Hop-by-hop 请求头：描述上游 socket 而非负载本身，绝不能原样回放给下游。
 *
 * - `host` 必须丢弃，因为下游目标是解析后的 Nacos 实例，host 头不同。
 * - `content-length` / `transfer-encoding` 会与新请求实际的 body 冲突。
 * - 其余按 RFC 7230 §6.1 列出，浏览器/Node 也都会自行管理。
 */
const HOP_BY_HOP: ReadonlySet<string> = new Set([
  "host",
  "connection",
  "keep-alive",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "content-length",
]);

/**
 * 自动转发上游请求头到 `nacos://` 下游调用。
 *
 * 读取 Next.js 当前请求作用域里的 `headers()`，把全部非 hop-by-hop 头
 * —— cookie、Authorization、Accept-Language、X-Trace-Id、自定义租户头等
 * —— 原样透传给下游服务，实现请求上下文的端到端贯通，无需逐个 cookie
 * 显式映射。
 *
 * 行为约定：
 * - 调用方已显式设置的头优先，**不会**被上游值覆盖。
 * - 默认仅对 `nacos://` 请求生效（`internalOnly: true`）。
 * - 不在请求作用域内（后台任务、cron、instrumentation）调用时静默降级，
 *   不影响业务请求。
 * - 必须运行在请求作用域里：Server Component / Server Action /
 *   Route Handler。后台任务无上游请求可转发，应改用 {@link headers}。
 *
 * @example
 * ```ts
 * plugins: [forward()]                          // 透传所有头
 * plugins: [forward({ exclude: ["x-debug"] })]  // 跳过噪音头
 * ```
 */
export function forward(opts: ForwardOptions = {}): Plugin {
  const skip = new Set<string>(HOP_BY_HOP);
  for (const h of opts.exclude ?? []) skip.add(h.toLowerCase());
  const internalOnly = opts.internalOnly ?? true;
  return {
    name: "forward",
    async onRequest({ request, context }) {
      if (internalOnly && !context.service) return;
      // 请求作用域之外（后台任务、instrumentation、cron）调用 `next/headers`
      // 会抛错。这里把异常当作「没有上游可转发」静默降级，避免把非请求
      // 调用方的下游请求一并搞炸。
      const incoming = await readUpstream();
      if (!incoming) return;
      const next = new Request(request, {
        headers: new Headers(request.headers),
      });
      let injected = 0;
      incoming.forEach((value, name) => {
        if (skip.has(name.toLowerCase())) return;
        if (next.headers.has(name)) return;
        next.headers.set(name, value);
        injected++;
      });
      return injected > 0 ? next : undefined;
    },
  };
}

/**
 * 安全读取 Next.js 上游请求头。
 *
 * 不在请求作用域时 `next/headers.headers()` 会抛错，这里捕获后返回 null
 * 让上层判断「没有上游」。
 */
async function readUpstream(): Promise<Headers | null> {
  try {
    const { headers } = await import("next/headers");
    return await headers();
  } catch {
    return null;
  }
}
