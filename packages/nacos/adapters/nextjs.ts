// 仅服务端守卫:client component 误 import 时由 Next bundler 在 build 期抛错。只在此、
// 不在框架无关核心,故 Hono / NestJS 服务端代码 import 核心不被误伤。
import "server-only";

import {
  create,
  resolveOptions,
  type Client,
  type OptionsOverride,
  type Runtime,
} from "../core";

type ConnectionFn = () => void | Promise<void>;
type HeadersFn = () => Headers | Promise<Headers>;
type RevalidateTagFn = (tag: string, opts?: { expire?: number }) => void;

// undefined=未探测 / null=不可用 / 函数=就绪。缓存动态 import 结果;请求作用域外调 next/* 抛错,当不可用降级。
let cachedConnection: ConnectionFn | null | undefined;
let cachedHeaders: HeadersFn | null | undefined;
let cachedRevalidate: RevalidateTagFn | null | undefined;

export const nextRuntime: Runtime = {
  async markDynamic(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    if (cachedConnection === undefined) {
      try {
        const mod = (await import("next/server")) as { connection?: ConnectionFn };
        cachedConnection = typeof mod.connection === "function" ? mod.connection : null;
      } catch {
        cachedConnection = null;
      }
    }
    if (!cachedConnection) return;
    try {
      await cachedConnection();
    } catch {}
  },

  async upstreamHeaders(): Promise<Headers | null> {
    if (cachedHeaders === undefined) {
      try {
        const mod = (await import("next/headers")) as { headers?: HeadersFn };
        cachedHeaders = typeof mod.headers === "function" ? mod.headers : null;
      } catch {
        cachedHeaders = null;
      }
    }
    if (!cachedHeaders) return null;
    try {
      return await cachedHeaders();
    } catch {
      return null;
    }
  },

  async revalidate(tag: string): Promise<void> {
    if (cachedRevalidate === undefined) {
      try {
        const mod = (await import("next/cache")) as { revalidateTag?: RevalidateTagFn };
        cachedRevalidate = typeof mod.revalidateTag === "function" ? mod.revalidateTag : null;
      } catch {
        cachedRevalidate = null;
      }
    }
    if (!cachedRevalidate) return;
    try {
      // expire:0 在 Next 15 被忽略、Next 16 表示立刻失效,两版行为一致。
      cachedRevalidate(tag, { expire: 0 });
    } catch {}
  },
};

declare global {
  // eslint-disable-next-line no-var
  var __nacos: Client | undefined;
}

let pending: Promise<Client> | null = null;

export async function init(
  input?: OptionsOverride | (() => OptionsOverride),
): Promise<Client> {
  if (pending) return pending;

  const existing = globalThis.__nacos;
  if (existing) {
    pending = Promise.resolve(existing);
    return pending;
  }

  pending = (async () => {
    if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
      throw new Error(
        "[nacos] requires the Node.js runtime. Guard with " +
          "`if (process.env.NEXT_RUNTIME === 'nodejs')` before importing.",
      );
    }
    const override = typeof input === "function" ? input() : (input ?? {});
    const c = create({ ...resolveOptions(override), runtime: nextRuntime });
    globalThis.__nacos = c; // 挂 globalThis 以便 dev HMR 间存活,避免重复注册到 Nacos。
    try {
      await c.start();
    } catch (err) {
      globalThis.__nacos = undefined;
      pending = null;
      throw err;
    }
    return c;
  })();
  return pending;
}

export function client(): Client {
  const c = globalThis.__nacos;
  if (!c) throw new Error("[nacos] not initialized; call init() first");
  return c;
}

export function tryClient(): Client | null {
  return globalThis.__nacos ?? null;
}

export async function dispose(): Promise<void> {
  const c = globalThis.__nacos;
  globalThis.__nacos = undefined;
  pending = null;
  if (c) await c.stop();
}
