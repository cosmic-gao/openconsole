# Data Layer —— 数据访问全图

> 模板的数据有四个来源:**自家 Postgres**(Drizzle)、**外部 BFF**(`{code,data,msg}` envelope)、
> **其它内部服务**(Nacos 服务发现)、**Redis**(应用层 + Next cache backend)。
> 每种都有固定姿势,本文一并讲清。

---

## 1. 自家 Postgres(Drizzle)

### 配置链

```
.env.local            DATABASE_URL=postgres://...@<host>:<5432 或 6432>/<db>
       │              ↑ 由用户提供;直连 5432 或经 pgbouncer transaction mode 6432 都可以
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

### pgbouncer 注意事项(如果用户的 Postgres 在 pgbouncer transaction mode 后面)

骨架不预置 pgbouncer 容器 —— `lib/db/index.ts` 的 `prepare: false` 让直连 5432 与经 pgbouncer 6432 两种都跑得了。**如果**用户的 `DATABASE_URL` 指向 pgbouncer transaction mode,以下约束生效:

| ✅ 可以 | ❌ 不可以 |
| --- | --- |
| 单条 query | `LISTEN/NOTIFY` |
| 简单事务 | prepared statements(Drizzle 已经 `prepare: false`) |
| RR 读 / 写 | session-level 设置(`SET LOCAL` 限于事务内可以) |
|  | 长事务跨多 query —— 会卡住整个 pool |

经 pgbouncer 时:`N × DATABASE_POOL_MAX ≤ pgbouncer DEFAULT_POOL_SIZE`(运维侧 pgbouncer 配置)。骨架默认 `DATABASE_POOL_MAX=5`。直连 5432 时不需要满足该约束,只需考虑 Postgres 自身的 `max_connections`。

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

### 调其它服务 —— **永远显式声明 headers**

```ts
"use server";

import { client } from "@openconsole/nacos";
import { z } from "zod";

import { safeUnwrap } from "@/lib/request";

const UserSchema = z.object({ id: z.string(), name: z.string() });

export async function getUser() {
  return safeUnwrap(
    UserSchema,
    client().service("user-service").get<unknown>("/users/me", {
      headers: { accept: "application/json" },   // ← 必须显式,见下方规则 ①
    }),
  );
}

export async function createOrder(body: unknown) {
  return safeUnwrap(
    OrderSchema,
    client().service("order-service").post<unknown>("/orders", body, {
      headers: {
        accept: "application/json",              // ← 必须显式
        "content-type": "application/json",     // ← POST/PUT 必须显式
      },
    }),
  );
}
```

### 必读规则

#### ① 永远显式 `headers: { accept: "application/json" }`

`@openconsole/nacos` 的 `forward()` 插件默认透传所有上游请求头给下游 `nacos://`
调用 —— 这里有个隐藏炸弹:**Server Action 的上游请求头里 `Accept` 是
`text/x-component`(RSC 二进制流格式)**,会原样转发给下游 Spring / Express
服务,而它们没有这个 converter,直接 HTTP **406 Not Acceptable**。

```
浏览器 GET /page      → Accept: text/html, */*;q=0.8   → 下游能产 JSON ✅
浏览器 POST /page     → Accept: text/x-component       → 下游 406 ❌  (Server Action)
```

解决:在调用点显式设 Accept(`forward()` 看到调用方已设的头不会覆盖):

| 方法 | 必设的 headers |
| --- | --- |
| `get(path, { headers })` | `accept: application/json` |
| `post(path, body, { headers })` | `accept` + `content-type: application/json` |
| `put(path, body, { headers })` | `accept` + `content-type: application/json` |
| `del(path, { headers })` | `accept: application/json` |

#### ② Cache Components 由客户端自动处理

nacos 客户端的 plugin pipeline、discovery TTL、负载均衡用到了 `Date.now()` /
`Math.random()`。Next.js 16 `cacheComponents` 模式要求任何这些调用之前先读
dynamic data(`cookies()` / `headers()` / `connection()` / `searchParams`),
否则路由会被拒绝渲染。

**`@openconsole/nacos` 客户端在 `Http.fetch` / `Discovery.list` 入口自动调用
`connection()`,把路由标记为 dynamic** —— 业务代码不需要再手动碰任何 dynamic
API,直接调 `client().fetch(...)` / `client().service(...).get(...)` 即可。

如果你写了自定义插件或者直接访问 `client.discovery.cache` 等内部 API,可以
显式调一次:

```ts
import { markDynamic } from "@openconsole/nacos";

await markDynamic();
// 之后的 Date.now() / Math.random() 都安全
```

`markDynamic()` 在非 Next 环境 / 非请求作用域内是 no-op,跨环境调用零风险。

### 想全局一刀切?两条偏方

**A. init 时把 Accept 从 forward 里 exclude 掉:**

```ts
// instrumentation.ts
import { init, forward, logger } from "@openconsole/nacos";

await init({
  plugins: [forward({ exclude: ["accept"] }), logger()],
});
```

下游 Spring 走自己的 default content negotiation(默认 JSON)。代价:失去
透传 `Accept-Language` 之类合理用例。

**B. 包一层 `lib/nacos.ts` 默认带头:**

```ts
import "server-only";
import { client } from "@openconsole/nacos";

const JSON_HEADERS = { accept: "application/json" } as const;
const JSON_BODY_HEADERS = {
  accept: "application/json",
  "content-type": "application/json",
} as const;

export function jsonService(name: string) {
  const svc = client().service(name);
  return {
    get: <T>(path: string, init: RequestInit = {}) =>
      svc.get<T>(path, { ...init, headers: { ...JSON_HEADERS, ...init.headers } }),
    post: <T>(path: string, body: unknown, init: RequestInit = {}) =>
      svc.post<T>(path, body, { ...init, headers: { ...JSON_BODY_HEADERS, ...init.headers } }),
    put: <T>(path: string, body: unknown, init: RequestInit = {}) =>
      svc.put<T>(path, body, { ...init, headers: { ...JSON_BODY_HEADERS, ...init.headers } }),
    del: <T>(path: string, init: RequestInit = {}) =>
      svc.del<T>(path, { ...init, headers: { ...JSON_HEADERS, ...init.headers } }),
  };
}
```

业务侧:`jsonService("opennacos").post("/orders", body)` —— 干净。

但模板默认走显式声明,不引入 helper —— 简单、可读、和 ofetch 风格一致。

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
| 调其它内部服务 | `await cookies(); svc.get("/p", { headers: { accept: "application/json" } })` (POST/PUT 加 `content-type`) | feature 里 |
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
