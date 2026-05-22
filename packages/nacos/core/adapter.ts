/**
 * Generic adapter — singleton lifecycle for hosting frameworks.
 *
 * A framework adapter is a thin wrapper around {@link Adapter} that binds the
 * generic init/client/dispose hooks to a framework-specific bootstrap point
 * (Next.js instrumentation, NestJS module, Hono middleware, …). The Adapter
 * itself owns:
 *
 *   - A `globalThis` slot so the client survives dev hot-reloads.
 *   - An in-flight `Promise<Client>` so concurrent `init()` calls dedupe.
 *   - A rollback path so a failed `start()` leaves no half-initialized state.
 *
 * Author a new adapter by instantiating with a unique `slot` and an optional
 * `guard` that throws when the host runtime is unsupported.
 */
import { create, type Client } from "./index";
import type { Options } from "./types";

export interface AdapterConfig {
  /** Key on `globalThis` where the singleton lives. Must survive HMR. */
  slot: string;
  /** Preflight check; throw to abort `init()`. */
  guard?: () => void;
}

type Store = Record<string, Client | undefined>;

export class Adapter {
  private pending: Promise<Client> | null = null;
  private readonly slot: string;
  private readonly guard: (() => void) | undefined;

  constructor(config: AdapterConfig) {
    this.slot = config.slot;
    this.guard = config.guard;
  }

  private get store(): Store {
    return globalThis as unknown as Store;
  }

  /** Bootstrap the singleton. Safe to call repeatedly. */
  init = (factory: () => Options): Promise<Client> => {
    if (this.pending) return this.pending;

    const existing = this.store[this.slot];
    if (existing) {
      this.pending = Promise.resolve(existing);
      return this.pending;
    }

    this.pending = (async () => {
      if (this.guard) this.guard();
      const c = create(factory());
      this.store[this.slot] = c;
      try {
        await c.start();
      } catch (err) {
        this.store[this.slot] = undefined;
        this.pending = null;
        throw err;
      }
      return c;
    })();
    return this.pending;
  };

  /** Get the singleton or throw — call after `init()`. */
  client = (): Client => {
    const c = this.store[this.slot];
    if (!c) {
      throw new Error(
        `[nacos] not initialized (slot='${this.slot}'); call init() first`,
      );
    }
    return c;
  };

  /** Get the singleton or null — for code paths that may run pre-init. */
  tryClient = (): Client | null => {
    return this.store[this.slot] ?? null;
  };

  /** Tear down the singleton (tests / forced restarts). Idempotent. */
  dispose = async (): Promise<void> => {
    const c = this.store[this.slot];
    this.store[this.slot] = undefined;
    this.pending = null;
    if (c) await c.stop();
  };
}
