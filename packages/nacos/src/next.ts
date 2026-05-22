/**
 * Next.js adapter.
 *
 * Idempotent bootstrap for the instrumentation hook and a singleton accessor
 * that survives dev HMR via `globalThis`. Call `init()` from
 * `instrumentation.ts`; everywhere else, just `client()` to get the shared
 * instance.
 *
 * HMR contract: across reloads the module-scoped `pending` is reset but
 * `globalThis.__nacos` survives — `init()` detects this and reuses the prior
 * Client to avoid duplicate provider registration and leaked subscriptions.
 * Call `dispose()` to force a teardown (tests, intentional restarts).
 */
import { create, type Client } from "./index";
import type { Options } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __nacos: Client | undefined;
}

let pending: Promise<Client> | null = null;

/** Bootstrap the singleton. Safe to call from `register()` repeatedly. */
export function init(factory: () => Options): Promise<Client> {
  if (pending) return pending;

  // Survive HMR: reuse the prior client instead of constructing a second one.
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
    const c = create(factory());
    globalThis.__nacos = c;
    try {
      await c.start();
    } catch (err) {
      // Roll back the global on a failed start so the next attempt can retry
      // cleanly instead of returning a half-initialized client.
      globalThis.__nacos = undefined;
      pending = null;
      throw err;
    }
    return c;
  })();
  return pending;
}

/** Get the singleton or throw — call after `init()`. */
export function client(): Client {
  if (!globalThis.__nacos) {
    throw new Error(
      "[nacos] not initialized; call init() from instrumentation.ts",
    );
  }
  return globalThis.__nacos;
}

/** Get the singleton or null — for code paths that may run pre-init. */
export function tryClient(): Client | null {
  return globalThis.__nacos ?? null;
}

/** Tear down the singleton (tests / forced restarts). Idempotent. */
export async function dispose(): Promise<void> {
  const c = globalThis.__nacos;
  globalThis.__nacos = undefined;
  pending = null;
  if (c) await c.stop();
}
