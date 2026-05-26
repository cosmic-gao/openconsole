# Data Layer —— 数据访问全图

> 模板的数据有四个来源:**自家 Postgres**(Drizzle)、**外部 BFF**(`{code,data,msg}` envelope)、
> **其它内部服务**(Nacos 服务发现)、**Redis**(应用层 + Next cache backend)。
> 每种都有固定姿势,本文一并讲清。

---

## 1. 自家 Postgres(Drizzle)

### 配置链

```
.env.local            DATABASE_URL=postgres://...@localhost:6432/postgres
       │              ↑ 必须经 pgbouncer(6432)而不是直连 5432
       ▼
env.ts                DATABASE_URL: z.url().startsWith("postgres")
       │              DATABASE_POOL_MAX: 5  (per-instance pool)
       │              DATABASE_CASING: "snake_case"
       ▼
lib/db/index.ts       drizzle({ client: postgres(url, { max, ... }), schema, casing })
       │              + globalThis 缓存避免 dev HMR 泄漏连接
       ▼
features/<domain>/    db.query.<table>.findMany / db.insert / db.update / ...
                      db.select().from().where()
```

### Schema(`lib/db/schema/<table>.ts`)

```ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Note = typeof notes.$inferSelect;       // 查询出来的形态
export type NewNote = typeof notes.$inferInsert;    // 插入用的形态
```

### 加新表的完整流程

1. **写 schema**:`lib/db/schema/<table>.ts`(命名一般是表的复数 `users` / `orders`)
2. **re-export**:`lib/db/schema/index.ts` 加 `export * from "./<table>";`
3. **生成迁移**:`pnpm db:generate`(drizzle-kit 扫 `./lib/db/schema/*.ts` 写到 `./drizzle/`)
4. **本地应用**:`pnpm db:push`(dev)或 `pnpm db:migrate`(staging / prod 部署前)
5. **业务用**:`features/<domain>/_cached.ts` + `features/<domain>/actions.ts`

### 数据库列名规范

- TS 端 camelCase(`createdAt` / `userId`)
- DB 端 snake_case(`created_at` / `user_id`)
- 由 `casing: "snake_case"` 自动转换(模板默认)

### pgbouncer 注意事项

模板的 docker-compose 起的是 **transaction mode** pgbouncer。约束:

| ✅ 可以 | ❌ 不可以 |
| --- | --- |
| 单条 query | `LISTEN/NOTIFY` |
| 简单事务 | prepared statements(Drizzle 已经 `prepare: false`) |
| RR 读 / 写 | session-level 设置(`SET LOCAL` 限于事务内可以) |
|  | 长事务跨多 query —— 会卡住整个 pool |

`N × DATABASE_POOL_MAX ≤ pgbouncer DEFAULT_POOL_SIZE (25)`,默认 5 让 5 个 Next.js 实例能跑满。

---

## 2. Cache Components —— `_cached.ts` + `actions.ts` 分层

### 为什么分两个文件

`'use cache'` 和 `'use server'` **不能在同一个文件**。所以:

| 文件 | directive | 内容 |
| --- | --- | --- |
| `features/<domain>/_cached.ts` | `'use cache'` | 可缓存的读 —— deterministic |
| `features/<domain>/actions.ts` | `'use server'` | Server Action —— 鉴权 + 写操作 + 失效缓存 |

### `_cached.ts` 内的硬规则

```ts
import "server-only";

import { cacheLife, cacheTag } from "next/cache";

export async function listNotesCached() {
  "use cache";              // 必须是函数第一行(除了 import)
  cacheLife("hours");       // 内置 profile: seconds / minutes / hours / days / weeks
  cacheTag("notes:list");   // 失效 key,actions.ts 里 updateTag(tag) 失效

  // 这里只能做 deterministic 操作:
  return db.query.notes.findMany({ orderBy: desc(notes.updatedAt), limit: 100 });
}
```

**禁止**在 `'use cache'` 函数里:

- `await cookies()` / `await headers()` —— 输入不确定
- `Date.now()` / `new Date()` / `Math.random()` —— 输入不确定
- 不在参数列表里的任何动态值

**允许**:

- `await db.query.*` —— 数据库结果会和 cache tag 一起缓存
- 所有参数(`id`、`filters`)—— cache key 自动包含

### `actions.ts` 包装

```ts
"use server";

import { updateTag } from "next/cache";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { NoteInput } from "./schemas";
import { listNotesCached } from "./_cached";

// 读 —— 直接转发到 _cached
export async function listNotes() {
  return listNotesCached();
}

// 写 —— 业务 + 失效缓存
export async function createNote(input: unknown) {
  const { title, content } = NoteInput.parse(input);
  const [row] = await db.insert(notes).values({ title, content }).returning();
  updateTag("notes:list");                  // 失效列表 cache
  return row;
}

export async function updateNote(rawId: unknown, input: unknown) {
  const id = NoteId.parse(rawId);
  const { title, content } = NoteInput.parse(input);
  const [row] = await db
    .update(notes)
    .set({ title, content, updatedAt: new Date() })
    .where(eq(notes.id, id))
    .returning();
  updateTag("notes:list");                  // 失效列表
  updateTag(`notes:item:${id}`);            // 失效单条
  return row;
}
```

### `cacheLife` profile 选择

| profile | 大约时长 | 适合 |
| --- | --- | --- |
| `seconds` | 秒级 | 实时性高、读取频繁的 |
| `minutes` | 分钟级 | 普通业务列表 |
| `hours` | 小时级 | 配置、字典、不常变 |
| `days` / `weeks` | 长期 | 历史归档、几乎不变 |

**注意**:即使设了几小时,只要相应 `updateTag()` 被调,立刻失效。tag 是「精确失效」,life 是「自然过期」。

---

## 3. Redis(双用途)

### 用途 A:Next cache backend(`cache-handler.mjs`)

**自动**,不需要业务代码改。dev 用内存,prod 用 Redis(共享所有实例)。

### 用途 B:应用层(`lib/redis/`)

```ts
// 业务文件
import "server-only";
import { redis } from "@/lib/redis";

// 限流
const count = await redis.incr(`ratelimit:${userId}`);
await redis.expire(`ratelimit:${userId}`, 60);

// pub/sub
await redis.publish("notifications", JSON.stringify({ type: "new-message" }));

// 临时状态
await redis.set(`captcha:${id}`, code, "EX", 300);
```

`lib/redis/client.ts` 是 ioredis 单例(`lazyConnect: true`,首次用才连)。

### 不要混淆两个 Redis 用途

| 关注点 | cache-handler.mjs | lib/redis |
| --- | --- | --- |
| 客户端 | `redis` npm 包 | `ioredis` |
| 用法 | Next 自己读写 | 业务代码读写 |
| keyPrefix | `<PROJECT>:cache:` | 业务自定义 |
| 关闭策略 | Next 管理 | ioredis 管理(`lazyConnect` + 重连策略) |

两个连接是独立的(虽然指向同一个 Redis URL),不要 cross-use。

---

## 4. 外部 BFF(envelope 协议)

### 协议

BFF 所有响应都是:

```ts
type ApiResponse<T> = {
  code: number;    // 0 = success, !=0 = failure
  data: T;
  msg: string;
};
```

### `lib/request/client.ts`

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
    // 自动注入 token + tenant_code 到所有请求
    const session = await getSessionHeaders();
    const headers = new Headers(options.headers);
    for (const [key, value] of Object.entries(session)) {
      headers.set(key, value);
    }
    options.headers = headers;
  },
});
```

### `safeUnwrap`(推荐)

带 zod 校验的 envelope 拆包:

```ts
import { request, safeUnwrap } from "@/lib/request";
import { User } from "./schemas";

export async function getMe() {
  return safeUnwrap(User, request("/web/um/sys/user/info"));
  // ↑ 三件事一起:
  //   1. ofetch 拉数据 + 自动注入 session 头
  //   2. zod 校验 envelope({ code, data: User, msg })
  //   3. code !== 0 抛 ApiError(code, msg)
}
```

### `unwrap`(不带 zod,**仅在数据形态可信时**用)

```ts
import { request, unwrap } from "@/lib/request";
import type { ApiResponse } from "@/lib/request";

const orders = await unwrap(request<ApiResponse<Order[]>>("/orders"));
```

### `ApiError` 处理

```ts
import { ApiError } from "@/lib/request";

try {
  await safeUnwrap(...);
} catch (err) {
  if (err instanceof ApiError) {
    // err.code   原始业务 code(-1 / 其它)
    // err.status 归一化后的 HTTP 状态(0 → 200, 4xx/5xx 透传, 其它 → 500)
    // err.message 来自 msg 字段
  }
}
```

### 自定义业务 code 映射

`codeToStatus(code)` 默认:

- `0` → `200`
- `400 ≤ code < 600` → 透传
- 其它(含 `-1`、`-401` 等)→ `500`

要把 `-401` 映射成 `401`(session 过期)?改 `lib/request/types.ts`:

```ts
export function codeToStatus(code: number): number {
  if (code === 0) return 200;
  if (code === -401) return 401;             // 加映射
  if (code >= 400 && code < 600) return code;
  return 500;
}
```

---

## 5. 其它内部服务(Nacos 服务发现)

### `instrumentation.ts` 已经启动

```ts
const { init } = await import("@openconsole/nacos");
await init();   // 零配置,读 NACOS_* env
```

### 调其它服务

```ts
import { client } from "@openconsole/nacos";

// 服务感知 URL —— 自动解析实例 + 负载均衡 + 重试
const res = await client().fetch("nacos://user-service/users/me");
const user = await res.json();

// 或 fluent service helper
const orders = await client().service("order-service").get<Order[]>("/orders");
```

详见 `@openconsole/nacos` 的 README(`packages/nacos/README.md`)。

### env 配置(本服务也注册到 Nacos)

```bash
NACOS_PROVIDER_ENABLED=true
NACOS_PROVIDER_SERVICE=<my-service>   # 别的服务能通过 nacos://<my-service>/ 调本服务
```

---

## 6. 前端拿数据 —— TanStack Query

### 标准目录

```
features/<domain>/queries/
├── keys.ts         # query key 工厂
└── options.ts      # queryOptions(queryKey + queryFn = action)
```

### `keys.ts`

```ts
export const noteKeys = {
  all: () => ["notes"] as const,
  list: () => [...noteKeys.all(), "list"] as const,
  detail: (id: number) => [...noteKeys.all(), "detail", id] as const,
};
```

层级:从粗到细。`queryClient.invalidateQueries({ queryKey: noteKeys.all() })` 失效整个 namespace。

### `options.ts`

```ts
import { queryOptions } from "@tanstack/react-query";
import { getNote, listNotes } from "../actions";
import { noteKeys } from "./keys";

export const noteQueries = {
  list: () => queryOptions({
    queryKey: noteKeys.list(),
    queryFn: () => listNotes(),               // Server Action!
    staleTime: 30 * 1000,
  }),
  detail: (id: number) => queryOptions({
    queryKey: noteKeys.detail(id),
    queryFn: () => getNote(id),
    staleTime: 30 * 1000,
  }),
};
```

### 在组件里用

```tsx
"use client";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { noteQueries } from "../queries/options";
import { noteKeys } from "../queries/keys";
import { createNote } from "../actions";

// Suspense 风格(配合 <Suspense fallback={...}>)
const { data } = useSuspenseQuery({ ...noteQueries.list(), initialData });

// 普通 query
const { data, isLoading } = useQuery(noteQueries.list());

// Mutation
const mutation = useMutation({
  mutationFn: createNote,
  onSuccess: (row) => {
    queryClient.setQueryData<Note[]>(noteKeys.list(), (old = []) => [row, ...old]);
    toast.success("Created");
  },
  onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
});
```

### Server Component 预取 → 客户端消费

`app/(dashboard)/notes/page.tsx` 的范式:

```tsx
// 1. RSC: 用 _cached.ts 的读取(走 Cache Components)
async function NotesShell() {
  const data = await listNotes();          // Server Action,内部转发到 _cached
  return <NotesTable initialData={data} />;
}

// 2. 包 Suspense
export default function NotesPage() {
  return (
    <Suspense fallback={<NotesSkeleton />}>
      <NotesShell />
    </Suspense>
  );
}

// 3. Client: 用 initialData
"use client";
const { data: notes } = useSuspenseQuery({ ...noteQueries.list(), initialData });
```

**为什么不用 HydrationBoundary**:Cache Components + `'use server'` queryFn 在 Next 16 与 HydrationBoundary 不稳定。模板用 `initialData` 直接喂 client,**这是当前推荐姿势**。

---

## 7. 数据流(完整一次写操作)

```
用户在 UI 点 "Create"
       │
       ▼
client mutation (useMutation)
   mutationFn: createNote (Server Action)
       │
       ▼
[网络] POST /api/<action-rpc>  ← Next 自动生成的 RPC 端点
       │
       ▼
Server Action createNote
   1. zod parse 入参
   2. await getSession() —— 可选鉴权
   3. db.insert(notes).values(...).returning()
   4. updateTag("notes:list") —— 失效 Cache Components
   5. return row
       │
       ▼
client onSuccess
   1. queryClient.setQueryData([..., "list"], (old) => [row, ...old])
   2. toast.success
       │
       ▼
其它打开 notes 页的浏览器
   下次 RSC 渲染时,Cache Components 因为 tag 失效会重新跑
   _cached 读到新数据,通过 initialData 喂给 client
```

---

## 8. 速查表

| 场景 | 用 | 文件 |
| --- | --- | --- |
| 加新数据库表 | `lib/db/schema/<table>.ts` + `pnpm db:generate` | `lib/db/schema/` |
| 加 Cache Components 缓存读 | `'use cache'` 函数 | `features/<domain>/_cached.ts` |
| 加 Server Action(读/写) | `'use server'` | `features/<domain>/actions.ts` |
| 在 RSC 里拿数据 | `await listNotes()` 直接调 action | `app/(dashboard)/.../page.tsx` |
| 在 client 端拿数据 | `useSuspenseQuery(noteQueries.list())` | `features/<domain>/components/*.tsx` |
| 写完失效缓存 | `updateTag("...")` 在 action 里 | `actions.ts` |
| 调外部 BFF | `safeUnwrap(Schema, request("/path"))` | feature 里 |
| 调其它内部服务 | `client().fetch("nacos://service/path")` | feature 里 |
| 应用层用 Redis | `redis.set / get / pub / sub` | feature 里 |

---

## 禁止

- ❌ 在 `_cached.ts` 里读 cookies / headers / Date.now / Math.random
- ❌ 跨 feature 直接 import 别人的 `_cached.ts` —— 必须经 Server Action
- ❌ 跳过 zod 校验直接 `db.insert(notes).values(input)` —— 用 `Schema.parse(input)` 先验
- ❌ 在 `app/api/<entity>/route.ts` 写 CRUD —— 用 Server Action
- ❌ 在客户端组件里写 SQL / 调 ORM —— Drizzle 是服务端专用,client 通过 Server Action 间接调
- ❌ 把 `request()`(BFF 客户端)暴露给 client —— `lib/request/client.ts` 第一行 `import "server-only"`
- ❌ 自己拼 `Bearer ${token}` —— 用 `getSessionHeaders()` 自动注入
- ❌ 跨多个 Server Action 凑事务 —— 在一个 action 内用 `db.transaction(async (tx) => {...})`
