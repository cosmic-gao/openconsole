/**
 * Config — in-memory snapshot fed by the registry's long-polling.
 *
 * Each watched dataId becomes a top-level key (alias or dataId). Reads are
 * synchronous; on a push we mutate the snapshot, notify in-process listeners,
 * and (when running under Next.js) fire `revalidateTag` so RSC segments tagged
 * with the same name are re-rendered on the next request.
 *
 * `stop()` is idempotent and unsubscribes everything — call it before the
 * Registry closes (or when intentionally tearing down for HMR/tests).
 */
import type { ConfigOptions, Registry } from "./types";

export interface ConfigDeps {
  registry: Registry;
  options: ConfigOptions;
}

interface Subscription {
  dataId: string;
  group?: string;
  listener: (content: string) => void;
}

export class Config {
  private readonly snapshot: Record<string, unknown> = {};
  private readonly listeners = new Set<(key: string, value: unknown) => void>();
  private readonly subscriptions: Subscription[] = [];
  private readonly registry: Registry;
  private readonly options: ConfigOptions;
  private started = false;

  constructor(deps: ConfigDeps) {
    this.registry = deps.registry;
    this.options = deps.options;
  }

  /** Load and subscribe every configured dataId. Idempotent. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    for (const src of this.options.sources ?? []) {
      const key = src.key ?? src.dataId;
      const raw = await this.registry.read(src.dataId, src.group);
      this.snapshot[key] = parse(raw, src.dataId);
      const listener = async (content: string) => {
        this.snapshot[key] = parse(content, src.dataId);
        this.fire(key);
        await this.revalidate();
      };
      this.subscriptions.push({
        dataId: src.dataId,
        group: src.group,
        listener,
      });
      await this.registry.observe(src.dataId, listener, src.group);
    }
  }

  /** Unsubscribe and drop in-process listeners. Idempotent. */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    const subs = this.subscriptions.splice(0);
    for (const s of subs) {
      try {
        await this.registry.unobserve(s.dataId, s.listener, s.group);
      } catch (err) {
        console.warn("[nacos] config unobserve failed", err);
      }
    }
    this.listeners.clear();
  }

  get<T>(key: string, fallback: T): T;
  get<T>(key: string): T | undefined;
  get(): Record<string, unknown>;
  get<T>(
    key?: string,
    fallback?: T,
  ): T | undefined | Record<string, unknown> {
    if (key === undefined) return this.snapshot;
    const value = this.snapshot[key];
    return (value === undefined ? fallback : value) as T | undefined;
  }

  on(listener: (key: string, value: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async revalidate(): Promise<void> {
    const tag = this.options.tag;
    if (!tag) return;
    try {
      const mod = (await import("next/cache").catch(() => null)) as
        | { revalidateTag?: unknown }
        | null;
      const fn = mod?.revalidateTag;
      if (typeof fn !== "function") return;
      // Tolerate both the Next 15 signature `revalidateTag(tag)` and the Next
      // 16 signature `revalidateTag(tag, profile)` without lying with `as
      // unknown as string`. `{ expire: 0 }` means "expire immediately" in 16.
      (fn as (...args: unknown[]) => void)(tag, { expire: 0 });
    } catch {
      /* not running under Next.js */
    }
  }

  private fire(key: string) {
    const value = this.snapshot[key];
    for (const l of this.listeners) {
      try {
        l(key, value);
      } catch (err) {
        console.error("[nacos] config listener threw", err);
      }
    }
  }
}

function parse(raw: string | null | undefined, dataId: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Non-JSON content (YAML, properties, raw text). Return the raw string —
    // callers wanting a structured value should either store JSON in Nacos
    // or post-process inside an `on()` listener. The previous URLSearchParams
    // fallback silently converted everything into form-encoded garbage.
    console.warn(
      `[nacos] config '${dataId}' is not JSON; exposing raw string`,
    );
    return raw;
  }
}
