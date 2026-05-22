/**
 * Next.js adapter.
 *
 * Idempotent bootstrap for the instrumentation hook and a singleton accessor
 * that survives dev HMR via `globalThis`. Call `init()` from
 * `instrumentation.ts`; everywhere else, just `client()` to get the shared
 * instance.
 *
 * HMR contract: across reloads `globalThis.__nacos` survives — `init()`
 * detects this and reuses the prior Client to avoid duplicate provider
 * registration and leaked subscriptions. Call `dispose()` to force a teardown
 * (tests, intentional restarts).
 */
import { Adapter, type Client } from "../core";

declare global {
  // eslint-disable-next-line no-var
  var __nacos: Client | undefined;
}

const adapter = new Adapter({
  slot: "__nacos",
  guard: () => {
    if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
      throw new Error(
        "[nacos] requires the Node.js runtime. Guard with " +
          "`if (process.env.NEXT_RUNTIME === 'nodejs')` before importing.",
      );
    }
  },
});

export const { init, client, tryClient, dispose } = adapter;
