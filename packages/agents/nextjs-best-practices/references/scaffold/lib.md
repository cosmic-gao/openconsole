# Scaffold —— `lib/` 跨 feature 基建

> 跨多个 feature 复用的服务端基建。所有文件 `import "server-only"`(除 `lib/query/*` 客户端可见的部分外)。

| # | 文件 | 用途 |
| --- | --- | --- |
| 32 | `lib/logger.ts` | consola 日志单例 + `scoped(tag)` |
| 33 | `lib/db/index.ts` | Drizzle + postgres-js 单例 |
| 34 | `lib/db/schema/index.ts` | schema barrel |
| 35 | `lib/db/schema/notes.ts` | 示范表 |
| 36 | `lib/redis/client.ts` | ioredis 单例(应用层) |
| 37 | `lib/redis/index.ts` | barrel |
| 38 | `lib/query/client.ts` | TanStack QueryClient |
| 39 | `lib/query/provider.tsx` | `<QueryProvider>` |
| 40 | `lib/query/index.ts` | barrel |
| 41 | `lib/request/client.ts` | ofetch + 自动注入 session 头 |
| 42 | `lib/request/types.ts` | envelope `{code,data,msg}` + `safeUnwrap` |
| 43 | `lib/request/index.ts` | barrel |

---

## [32] `lib/logger.ts`

```ts
import { createConsola } from "consola";

export const logger = createConsola({
  level: process.env.NODE_ENV === "production" ? 3 : 4,
  defaults: { tag: "app" },
});

export const scoped = (tag: string) => logger.withTag(tag);
```

## [33] `lib/db/index.ts`

```ts
import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";

import * as schema from "./schema";


const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__pgClient ??
  postgres(env.DATABASE_URL, {
    max: env.DATABASE_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__pgClient = client;

export const db = drizzle({ client, schema, casing: env.DATABASE_CASING });
export type Database = typeof db;
```

## [34] `lib/db/schema/index.ts`

```ts
export * from "./notes";
```

## [35] `lib/db/schema/notes.ts`

```ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
```

## [36] `lib/redis/client.ts`

```ts
import "server-only";

import Redis from "ioredis";

import { env } from "@/env";

const globalForRedis = globalThis as unknown as {
  __redisClient?: Redis;
};

export const redis =
  globalForRedis.__redisClient ??
  new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 5000);
    },
    reconnectOnError(error) {
      return error.message.includes("READONLY");
    },
  });

if (process.env.NODE_ENV !== "production") globalForRedis.__redisClient = redis;

export type RedisClient = typeof redis;
```

## [37] `lib/redis/index.ts`

```ts
export { redis, type RedisClient } from "./client";
```

## [38] `lib/query/client.ts`

```ts
import {
  QueryClient,
  defaultShouldDehydrateQuery,
  environmentManager,
} from "@tanstack/react-query";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
```

## [39] `lib/query/provider.tsx`

```tsx
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { getQueryClient } from "./client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools />
    </QueryClientProvider>
  );
}
```

## [40] `lib/query/index.ts`

```ts
export { getQueryClient } from "./client";
export { QueryProvider } from "./provider";
```

## [41] `lib/request/client.ts`

```ts
import "server-only";

import { ofetch } from "ofetch";

import { env } from "@/env";
import { getSessionHeaders } from "@/features/auth/server/session";

export const request = ofetch.create({
  baseURL: env.NEXT_PUBLIC_AUTH_URL,
  retry: 1,
  retryDelay: 300,
  timeout: 15_000,
  async onRequest({ options }) {
    const session = await getSessionHeaders();
    const headers = new Headers(options.headers);
    for (const [key, value] of Object.entries(session)) {
      headers.set(key, value);
    }
    options.headers = headers;
  },
});
```

## [42] `lib/request/types.ts`

```ts
import { z, type ZodType } from "zod";

export type ApiResponse<T> = {
  code: number;
  data: T;
  msg: string;
};

export function codeToStatus(code: number): number {
  if (code === 0) return 200;
  if (code >= 400 && code < 600) return code;
  return 500;
}

export class ApiError extends Error {
  readonly code: number;
  readonly status: number;

  constructor(code: number, message: string) {
    super(message || `Request failed (code=${code})`);
    this.name = "ApiError";
    this.code = code;
    this.status = codeToStatus(code);
  }
}

export function envelope<T extends ZodType>(data: T) {
  return z.object({
    code: z.number(),
    data,
    msg: z.string(),
  });
}

export async function unwrap<T>(promise: Promise<ApiResponse<T>>): Promise<T> {
  const res = await promise;
  if (res.code !== 0) throw new ApiError(res.code, res.msg);
  return res.data;
}

export async function safeUnwrap<T extends ZodType>(
  schema: T,
  promise: Promise<unknown>,
): Promise<z.infer<T>> {
  const raw = await promise;
  const parsed = envelope(schema).safeParse(raw);

  if (!parsed.success) {
    throw new ApiError(422, formatZodError(parsed.error));
  }

  const { code, data, msg } = parsed.data as ApiResponse<z.infer<T>>;
  if (code !== 0) throw new ApiError(code, msg);
  return data;
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "$";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
```

## [43] `lib/request/index.ts`

```ts
export { request } from "./client";
export {
  ApiError,
  codeToStatus,
  envelope,
  safeUnwrap,
  unwrap,
  type ApiResponse,
} from "./types";
```

---

下一步:[`features-auth.md`](./features-auth.md) —— `features/auth/` 鉴权切片
