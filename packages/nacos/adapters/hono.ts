import type { MiddlewareHandler } from "hono";

import {
  create,
  currentRequestHeaders,
  resolveOptions,
  withRequestHeaders,
  type Client,
  type OptionsOverride,
  type Runtime,
} from "../core";

export const honoRuntime: Runtime = {
  markDynamic(): void {},
  upstreamHeaders(): Headers | null {
    return currentRequestHeaders();
  },
  revalidate(): void {},
};

export interface NacosHonoOptions extends OptionsOverride {
  onRevalidate?: (tag: string) => void | Promise<void>;
  contextKey?: string;
  exposeOnContext?: boolean;
}

export interface NacosHono {
  readonly client: Client;
  readonly middleware: MiddlewareHandler;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createNacos(options: NacosHonoOptions = {}): NacosHono {
  const { onRevalidate, contextKey = "nacos", exposeOnContext = true, ...override } = options;

  const runtime: Runtime = onRevalidate
    ? { ...honoRuntime, revalidate: (tag) => onRevalidate(tag) }
    : honoRuntime;

  const client = create({ ...resolveOptions(override), runtime });

  const middleware: MiddlewareHandler = async (c, next) => {
    // 放宽类型:Hono 把 c.set 的键约束在 ContextVariableMap,这里支持任意配置键。
    if (exposeOnContext) {
      (c.set as (key: string, value: unknown) => void)(contextKey, client);
    }
    await withRequestHeaders(c.req.raw.headers, next);
  };

  return {
    client,
    middleware,
    start: () => client.start(),
    stop: () => client.stop(),
  };
}
