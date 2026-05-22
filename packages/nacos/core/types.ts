/**
 * Shared types. Names are package-scoped (no `Nacos*` prefix) — consumers
 * disambiguate via the namespace import: `import * as nacos from '@openconsole/nacos'`
 * or named imports: `import type { Client, Instance } from '@openconsole/nacos'`.
 */

// -- Service discovery -----------------------------------------------------

export interface Instance {
  /** Registry-assigned id; undefined when the registry didn't supply one. */
  id?: string;
  service: string;
  ip: string;
  port: number;
  healthy: boolean;
  enabled: boolean;
  weight?: number;
  cluster?: string;
  metadata?: Record<string, string>;
}

export interface RegisterOptions {
  group?: string;
  ephemeral?: boolean;
}

export interface Registry {
  ready(): Promise<void>;
  close(): Promise<void>;

  register(instance: Instance, opts?: RegisterOptions): Promise<void>;
  deregister(instance: Instance, opts?: RegisterOptions): Promise<void>;
  list(service: string, group?: string): Promise<Instance[]>;
  watch(
    service: string,
    listener: (instances: Instance[]) => void,
    group?: string,
  ): Promise<void>;
  unwatch(
    service: string,
    listener: (instances: Instance[]) => void,
    group?: string,
  ): Promise<void>;

  read(dataId: string, group?: string): Promise<string | null>;
  observe(
    dataId: string,
    listener: (content: string) => void,
    group?: string,
  ): Promise<void>;
  unobserve(
    dataId: string,
    listener: (content: string) => void,
    group?: string,
  ): Promise<void>;
}

// -- Load balancing --------------------------------------------------------

export interface Hint {
  /** Sticky key, e.g. user/tenant id. */
  key?: string;
  /** Per-call attempt counter (set by the retry loop). */
  attempt?: number;
}

export interface Balancer {
  readonly name: string;
  pick(instances: Instance[], hint?: Hint): Instance | null;
}

export type Strategy =
  | "round-robin"
  | "random"
  | "weighted"
  | "sticky"
  | Balancer;

// -- Retry -----------------------------------------------------------------

export interface Retry {
  /** Total attempts including the first try. */
  attempts: number;
  /** Per-attempt delay (ms); index 0 = before retry #1. */
  delays?: number[];
  /** Predicate: should we retry given this error/response? */
  when?: (input: RetryInput) => boolean;
}

export interface RetryInput {
  attempt: number;
  error?: unknown;
  response?: Response;
}

// -- Plugin pipeline -------------------------------------------------------

export interface Context {
  service?: string;
  attempt: number;
  startedAt: number;
}

export interface RequestStep {
  request: Request;
  context: Context;
}

export interface ResponseStep {
  request: Request;
  response: Response;
  context: Context;
}

export interface ErrorStep {
  request: Request;
  error: unknown;
  context: Context;
}

export interface Plugin {
  readonly name: string;
  onRequest?: (step: RequestStep) => Request | void | Promise<Request | void>;
  onResponse?: (step: ResponseStep) => Response | void | Promise<Response | void>;
  onError?: (step: ErrorStep) => void | Promise<void>;
}

// -- HTTP options ----------------------------------------------------------

export interface FetchOptions extends RequestInit {
  balancer?: Balancer;
  hint?: Hint;
  timeout?: number;
  retry?: Retry;
  group?: string;
  /** Scheme for the resolved `nacos://` URL. Preferred over `?scheme=`. */
  scheme?: "http" | "https";
}

// -- Top-level config ------------------------------------------------------

export interface Options {
  registry: RegistryOptions;
  provider?: ProviderOptions;
  consumer?: ConsumerOptions;
  config?: ConfigOptions;
  plugins?: Plugin[];
}

export interface RegistryOptions {
  server: string;
  namespace?: string;
  username?: string;
  password?: string;
  timeout?: number;
}

export interface ProviderOptions {
  enabled: boolean;
  service: string;
  port: number;
  ip?: string;
  group?: string;
  weight?: number;
  cluster?: string;
  metadata?: Record<string, string>;
  ephemeral?: boolean;
}

export interface ConsumerOptions {
  balancer?: Strategy;
  timeout?: number;
  retry?: Retry;
  ttl?: number;
}

export interface ConfigOptions {
  /** Each dataId becomes a top-level key in the snapshot. */
  sources?: Array<{ dataId: string; group?: string; key?: string }>;
  /** Cache tag fired via revalidateTag when a config changes. */
  tag?: string;
}
