import { NO_OP_RUNTIME, type Runtime } from "./runtime";
import type { ConfigOptions, Registry } from "./types";

export interface ConfigDeps {
  registry: Registry;
  options: ConfigOptions;
  runtime?: Runtime;
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
  private readonly runtime: Runtime;
  private started = false;

  constructor(deps: ConfigDeps) {
    this.registry = deps.registry;
    this.options = deps.options;
    this.runtime = deps.runtime ?? NO_OP_RUNTIME;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await Promise.all(
      (this.options.sources ?? []).map(async (src) => {
        const key = src.key ?? src.dataId;
        const raw = await this.registry.read(src.dataId, src.group);
        this.snapshot[key] = parse(raw, src.dataId);
        const listener = async (content: string) => {
          this.snapshot[key] = parse(content, src.dataId);
          this.fire(key);
          await this.revalidate();
        };
        this.subscriptions.push({ dataId: src.dataId, group: src.group, listener });
        await this.registry.observe(src.dataId, listener, src.group);
      }),
    );
  }

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
  get<T>(key?: string, fallback?: T): T | undefined | Record<string, unknown> {
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
    await this.runtime.revalidate(tag);
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

// 非 JSON(YAML / properties / 纯文本)原样保留为字符串并 warn,调用方可在 on() 回调里自解析。
function parse(raw: string | null | undefined, dataId: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`[nacos] config '${dataId}' is not JSON; exposing raw string`);
    return raw;
  }
}
