import type { Runtime } from "./runtime";

export const DEFAULT_GROUP = "DEFAULT_GROUP";

export interface Instance {
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
  watch(service: string, listener: (instances: Instance[]) => void, group?: string): Promise<void>;
  unwatch(service: string, listener: (instances: Instance[]) => void, group?: string): Promise<void>;
  read(dataId: string, group?: string): Promise<string | null>;
  observe(dataId: string, listener: (content: string) => void, group?: string): Promise<void>;
  unobserve(dataId: string, listener: (content: string) => void, group?: string): Promise<void>;
}

export interface Hint {
  key?: string;
  attempt?: number;
}

export interface Balancer {
  readonly name: string;
  pick(instances: Instance[], hint?: Hint): Instance | null;
}

export type Strategy = "round-robin" | "random" | "weighted" | "sticky" | Balancer;

export interface Retry {
  attempts: number;
  delays?: number[];
  when?: (input: RetryInput) => boolean;
}

export interface RetryInput {
  attempt: number;
  error?: unknown;
  response?: Response;
}

export interface Context {
  service?: string;
  attempt: number;
  startedAt: number;
  startedAtPerf: number;
  runtime: Runtime;
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

export interface FetchOptions extends RequestInit {
  balancer?: Balancer;
  hint?: Hint;
  timeout?: number;
  retry?: Retry;
  group?: string;
  scheme?: "http" | "https";
}

export interface Options {
  registry: RegistryOptions;
  provider?: ProviderOptions;
  consumer?: ConsumerOptions;
  config?: ConfigOptions;
  plugins?: Plugin[];
  runtime?: Runtime;
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
  sources?: Array<{ dataId: string; group?: string; key?: string }>;
  tag?: string;
}
