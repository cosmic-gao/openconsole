---
name: drizzle-orm
description: |
  公司内部 Next.js 项目的 Drizzle ORM 使用规范,自包含完整定义。统一骨架用 **`drizzle-orm/postgres-js` + `postgres`** 驱动(不是 `node-postgres` / `pg`);客户端是 `globalThis` 单例 + `import "server-only"`;通过 `prepare: false` 同时兼容**直连 Postgres :5432** 与**经 pgbouncer transaction mode :6432** 两种部署 —— `DATABASE_URL` 由用户在 scaffold 流程 Step 2 提供。按 `DATABASE_CASING=snake_case` 自动转换 TS camelCase ↔ DB snake_case。

  必须在以下场景触发,即使用户没说出 skill 名:加表 / 新表 / database schema / `pgTable` / 加字段 / 改字段 / 写 schema / 生成迁移 / `drizzle-kit generate` / `pnpm db:generate` / `pnpm db:push` / `pnpm db:migrate` / `pnpm db:studio` / `db.query.*.findMany` / `db.select` / `db.insert` / `db.update` / `db.delete` / `eq()` / `desc()` / `inArray()` / `returning()` / `$inferSelect` / `$inferInsert` / `relations()` / one-to-many / many-to-many / `db.transaction` / pgbouncer / DATABASE_URL / DATABASE_POOL_MAX / DATABASE_CASING / `lib/db/` / `drizzle.config.ts` / 写 `_cached.ts` / `'use cache'` 函数里查数据库 / `updateTag` 后查数据库 / N+1 / 列名映射 / 改 connection pool / postgres-js / prepared statements / Drizzle Studio。

  **禁止**:用 `pg` / `node-postgres` / `Prisma` / `TypeORM` / 在 `_cached.ts` 里调 `Date.now()` / 直接 `db.insert(...)` 不经 zod / 在 `app/api/<entity>/route.ts` 里跑 CRUD(必须走 Server Action) / 在客户端组件里 import `@/lib/db` / 跨 feature 直接 import 别人的 `_cached.ts` / 设 `prepare: true`(若用户的 Postgres 在 pgbouncer transaction mode 后面会断)。

  全局架构约束见同目录 `AGENTS.md`;数据层全景 + Cache Components 整合见 `nextjs-best-practices/references/data-layer.md`;Server Action 写法见 `nextjs-best-practices` skill。
---

# Drizzle ORM —— 统一骨架的 ORM 规范

> 统一骨架用 Drizzle 做 **自家 Postgres 的 ORM**。本 skill 自包含完整规范:客户端单例怎么写、schema 怎么定义、迁移流程、查询写法、与 Cache Components 的整合、pgbouncer 限制 —— 全部在本文里给出可直接拷贝的代码。
>
> 涉及的骨架文件:
> - `lib/db/index.ts` —— 客户端单例
> - `lib/db/schema/<table>.ts` —— 表定义,一张表一个文件
> - `drizzle.config.ts` —— drizzle-kit 配置
> - `features/<domain>/_cached.ts` + `features/<domain>/actions.ts` —— `'use cache'` + Server Action 闭环
> - `env.ts` —— `DATABASE_URL` / `DATABASE_POOL_MAX` / `DATABASE_CASING`
>
> **Postgres 不在骨架内**。`DATABASE_URL` 由用户在 scaffold 流程 Step 2 提供(直连 5432 或经 pgbouncer 6432 都行)。骨架不预置 docker-compose。

---

## 1. 客户端单例(`lib/db/index.ts`,**已预置,一般不改**)

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
    max: env.DATABASE_POOL_MAX,    // per-instance pool;经 pgbouncer 时 N × max ≤ DEFAULT_POOL_SIZE
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,                // 同时兼容直连 Postgres / 经 pgbouncer transaction mode
  });

if (process.env.NODE_ENV !== "production") globalForDb.__pgClient = client;

export const db = drizzle({ client, schema, casing: env.DATABASE_CASING });
export type Database = typeof db;
```

**为什么这样写**(读懂再动手):

| 决定 | 原因 |
| --- | --- |
| `drizzle-orm/postgres-js` + `postgres` | Edge / serverless 兼容更好,bundle 比 `pg` 小,模板统一选 |
| `import "server-only"` | 防止客户端组件意外 import `db`,触发 build 错 |
| `globalThis.__pgClient` 缓存 | Next dev HMR 每次重编都会重 require 此模块;不缓存会几秒内打爆 Postgres / pgbouncer 的连接池 |
| `max: env.DATABASE_POOL_MAX`(默认 5) | 经 pgbouncer 时需满足 N × max ≤ DEFAULT_POOL_SIZE;直连 Postgres 时只需考虑 PG 的 `max_connections` |
| `prepare: false` | pgbouncer transaction mode 不持有会话,prepared statements 会断;直连 Postgres 时只是放弃 prep statement 复用(轻微 perf 损失,功能正常)—— 所以这个值**两种部署都安全** |
| `casing: env.DATABASE_CASING` | TS 里写 `createdAt`,DB 里自动变 `created_at`,**单一事实来源在 TS** |

**禁止**:用 `pg` / `node-postgres` / `Pool`,在客户端 import `@/lib/db`,设 `prepare: true`(若用户 Postgres 在 pgbouncer transaction mode 后面会断)。

---

## 2. Schema 文件结构

### 一张表一个文件:`lib/db/schema/<table>.ts`

```ts
// lib/db/schema/notes.ts
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

export type Note = typeof notes.$inferSelect;       // 查询出来的形态
export type NewNote = typeof notes.$inferInsert;    // 插入用的形态
```

### Barrel re-export:`lib/db/schema/index.ts`

```ts
export * from "./notes";
export * from "./<新表>";   // 加表时这一行也要加
```

`lib/db/index.ts` 里 `import * as schema from "./schema"` —— drizzle-kit 扫这个 barrel 决定迁移内容。

### 命名约定

| 层 | 写法 |
| --- | --- |
| TS 字段名 | camelCase(`createdAt` / `userId` / `tenantCode`) |
| DB 列名 | snake_case(`created_at` / `user_id` / `tenant_code`)—— **由 `casing: "snake_case"` 自动转换,你只写 TS 名字** |
| 表名 | 复数 + snake_case(`notes` / `user_profiles`) |
| 主键 | `serial("id").primaryKey()`(自增整数);需要 UUID 用 `uuid("id").primaryKey().defaultRandom()` |
| 时间戳 | `timestamp("created_at", { withTimezone: true })` —— **永远 with timezone**,Postgres 默认无时区会踩坑 |
| 默认现在 | `.defaultNow()` |
| `NOT NULL` | `.notNull()` |

---

## 3. 加新表的完整流程

```bash
# 1. 写 schema
#    -> lib/db/schema/<table>.ts(pgTable 定义)
#    -> lib/db/schema/index.ts(加 export * from "./<table>")

# 2. 生成迁移文件
pnpm db:generate
#    -> 在 drizzle/<num>_<random>.sql 写 SQL
#    -> 在 drizzle/meta/<num>_snapshot.json 写 schema 快照
#    -> 在 drizzle/meta/_journal.json 记录

# 3. 应用迁移
pnpm db:push      # dev:跳过迁移文件,直接对齐 schema 到 DB(快速迭代)
pnpm db:migrate   # prod / staging:按 drizzle/ 里的 SQL 文件顺序执行

# 4. 验证(可选)
pnpm db:studio    # 起一个 Drizzle Studio,浏览器看数据
```

迁移文件、`meta/_journal.json`、`meta/*_snapshot.json` **必须提交进 git**;`meta/_journal.json.lock` 已在 `.gitignore`。

**禁止**:

- 手写 SQL 进 `drizzle/<num>_*.sql` —— 让 drizzle-kit 生成
- 在 prod 跑 `db:push`(会跳过迁移历史,容易丢字段)
- 在 dev 跑 `db:migrate` 但 DB 不通(`.env.local` 的 `DATABASE_URL` 错)

---

## 4. 查询(读 + 写)

### 4.1 读:两种风格,看场景选

```ts
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

// 风格 A:Drizzle Query API(声明式,适合带 relations 的)
const rows = await db.query.notes.findMany({
  orderBy: desc(notes.updatedAt),
  limit: 100,
  // with: { author: true },     // 有 relations 才能用
});

// 风格 B:SQL Builder(更接近 SQL,适合 join / 复杂条件)
const [row] = await db
  .select()
  .from(notes)
  .where(eq(notes.id, id))
  .limit(1);
```

| 你想做 | 用 |
| --- | --- |
| 简单 list / detail | `db.query.<table>.findMany / findFirst` |
| 跨表 join | `db.select().from().leftJoin(...)` |
| 聚合 / 子查询 / CTE | `db.select` + `sql\`...\`` 模板 |

### 4.2 写:`insert` / `update` / `delete`(看模板 `features/notes/actions.ts`)

```ts
"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";

import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";

// INSERT
const [row] = await db
  .insert(notes)
  .values({ title, content })
  .returning();

// UPDATE
const [row] = await db
  .update(notes)
  .set({ title, content, updatedAt: new Date() })
  .where(eq(notes.id, id))
  .returning();
if (!row) throw new Error("Note not found");

// DELETE
const [row] = await db
  .delete(notes)
  .where(eq(notes.id, id))
  .returning({ id: notes.id });
if (!row) throw new Error("Note not found");
```

**关键**:

- 永远 `.returning()`,这样能拿到结果用来更新 TanStack Query cache
- `!row` 判空 —— 不存在的行没报错(0 row affected),业务上当成失败抛
- 写完一定要调 `updateTag(...)` 失效相关缓存(见下一节)

### 4.3 zod 校验入参 —— **写之前必做**

```ts
// features/<domain>/schemas.ts
import { z } from "zod";

export const NoteInput = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().max(10_000),
});

export const NoteId = z.coerce.number().int().positive();

// features/<domain>/actions.ts
"use server";
const { title, content } = NoteInput.parse(input);   // 抛 ZodError
const id = NoteId.parse(rawId);
```

**禁止**:直接 `db.insert(notes).values(input)` 不经 zod —— Server Action 入参是公开 RPC,客户端可以构造任意 payload。

---

## 5. Cache Components 整合 —— `'use cache'` 在 `_cached.ts`

**核心约束**:`'use cache'` 和 `'use server'` **不能在同一个文件**。模板的姿势:

| 文件 | directive | 内容 |
| --- | --- | --- |
| `features/<domain>/_cached.ts` | `'use cache'` | 可缓存的读 —— deterministic |
| `features/<domain>/actions.ts` | `'use server'` | Server Action —— zod / 鉴权 / 写 / 失效缓存 |

### `_cached.ts`(模板 `features/notes/_cached.ts`)

```ts
import "server-only";

import { desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";

export async function listNotesCached() {
  "use cache";              // 必须函数第一行(除 import)
  cacheLife("hours");       // 内置 profile:seconds / minutes / hours / days / weeks
  cacheTag("notes:list");   // 失效 key,actions.ts 里 updateTag(tag) 触发失效

  return db.query.notes.findMany({
    orderBy: desc(notes.updatedAt),
    limit: 100,
  });
}

export async function getNoteCached(id: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(`notes:item:${id}`);   // 参数化 tag,精确失效单条

  const [row] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  return row ?? null;
}
```

**`'use cache'` 函数里禁止**:

- `await cookies()` / `await headers()` —— 输入不确定,会拒绝缓存
- `Date.now()` / `new Date()` / `Math.random()` —— 输入不确定
- 任何不在参数列表里的动态值

允许:`db.query.*` / `db.select(...)` 全部 OK —— 数据库结果会与 cache tag 一起缓存。

### `actions.ts` 失效

```ts
// features/notes/actions.ts
"use server";

import { updateTag } from "next/cache";

import { listNotesCached } from "./_cached";

// 读:直接转发(让 client / RSC 都走 Server Action,统一鉴权位置)
export async function listNotes() {
  return listNotesCached();
}

// 写:业务 + 失效缓存
export async function createNote(input: unknown) {
  const { title, content } = NoteInput.parse(input);
  const [row] = await db.insert(notes).values({ title, content }).returning();
  updateTag("notes:list");                 // 列表 cache 失效
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
  if (!row) throw new Error("Note not found");
  updateTag("notes:list");
  updateTag(`notes:item:${id}`);
  return row;
}
```

### `cacheLife` profile 选择速查

| profile | 大致时长 | 适合 |
| --- | --- | --- |
| `seconds` | 秒级 | 实时性强、读取频繁 |
| `minutes` | 分钟级 | 普通业务列表 |
| `hours` | 小时级 | 配置、字典、不常变(模板 notes 用 hours) |
| `days` / `weeks` | 长期 | 历史归档、几乎不变 |

`updateTag()` 立刻失效;`cacheLife` 是自然过期上限。

---

## 6. Relations(一对多 / 多对多)

模板 `notes` 表目前没 relations,加 relations 时按以下流程:

### 一对多 —— 一个 author 多个 notes

```ts
// lib/db/schema/authors.ts
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { notes } from "./notes";

export const authors = pgTable("authors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

export const authorsRelations = relations(authors, ({ many }) => ({
  notes: many(notes),
}));

// lib/db/schema/notes.ts —— 加 authorId 外键
import { integer } from "drizzle-orm/pg-core";

export const notes = pgTable("notes", {
  // ...其它字段
  authorId: integer("author_id").references(() => authors.id),
});

export const notesRelations = relations(notes, ({ one }) => ({
  author: one(authors, {
    fields: [notes.authorId],
    references: [authors.id],
  }),
}));
```

`lib/db/schema/index.ts` 加 `export * from "./authors";`。

### 查询带 relations

```ts
const list = await db.query.authors.findMany({
  with: { notes: true },
});
// → [{ id, name, notes: [{ id, title, ... }] }, ...]
```

详见 [`references/advanced-schemas.md`](./references/advanced-schemas.md)。

---

## 7. 事务(`db.transaction`)

模板的 `notes` feature 还没用到事务,加事务的姿势:

```ts
"use server";

export async function transferBalance(fromId: number, toId: number, amount: number) {
  return db.transaction(async (tx) => {
    const [from] = await tx.update(accounts)
      .set({ balance: sql`${accounts.balance} - ${amount}` })
      .where(eq(accounts.id, fromId))
      .returning();

    if (!from || from.balance < 0) {
      tx.rollback();   // 显式回滚
      throw new Error("Insufficient balance");
    }

    await tx.update(accounts)
      .set({ balance: sql`${accounts.balance} + ${amount}` })
      .where(eq(accounts.id, toId));

    updateTag(`account:${fromId}`);
    updateTag(`account:${toId}`);
  });
}
```

**禁止**:跨多个 Server Action 凑一次事务 —— 必须在**同一个** Server Action 内 `db.transaction(...)`。

pgbouncer transaction mode 下的事务限制:

- 不能 `LISTEN` / `NOTIFY`
- 不能持有 cross-statement 的 session 设置
- 长事务会卡住整个 pool —— 别在事务里调外部 API

---

## 8. 前端拿数据(TanStack Query + Server Action queryFn)

模板 `features/notes/queries/options.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";

import { getNote, listNotes } from "../actions";
import { noteKeys } from "./keys";

export const noteQueries = {
  list: () => queryOptions({
    queryKey: noteKeys.list(),
    queryFn: () => listNotes(),       // ← Server Action 直接当 queryFn
    staleTime: 30 * 1000,
  }),
  detail: (id: number) => queryOptions({
    queryKey: noteKeys.detail(id),
    queryFn: () => getNote(id),
    staleTime: 30 * 1000,
  }),
};
```

RSC 预取 + client 端 `initialData`(模板 `app/(dashboard)/notes/page.tsx`):

```tsx
async function NotesShell() {
  const data = await listNotes();          // RSC 调 Server Action → _cached
  return <NotesTable initialData={data} />;
}

// client
const { data: notes } = useSuspenseQuery({
  ...noteQueries.list(),
  initialData,
});
```

**为什么不用 HydrationBoundary**:Next 16 的 Cache Components + `'use server'` queryFn 与 HydrationBoundary 流式 hydration 当前不稳定。模板用 `initialData` 直接喂 client 是**当前推荐姿势**。

---

## 9. pgbouncer transaction mode 注意事项(如果用户的 Postgres 在 pgbouncer transaction mode 后面)

骨架不预置 pgbouncer 容器 —— `DATABASE_URL` 由用户提供。**只有当用户的 Postgres 在 pgbouncer transaction mode 后面**(URL 一般指向端口 `6432`)时,下面的约束才生效。直连 Postgres 5432 的用户可以跳过本节。

| ✅ 可以 | ❌ 不可以 |
| --- | --- |
| 单条 query | `LISTEN/NOTIFY` |
| 简单事务(全部在一次 `db.transaction()` 里) | prepared statements(模板已 `prepare: false`) |
| RR 读 / 写 | session-level `SET`(`SET LOCAL` 限于事务内 OK) |
|  | 长事务跨多个 query —— 会卡住整个 pool |

经 pgbouncer 时:`N × DATABASE_POOL_MAX ≤ pgbouncer DEFAULT_POOL_SIZE`(运维侧 pgbouncer 配置)。骨架默认 `DATABASE_POOL_MAX=5`,要调整就改 `.env.local` 的 `DATABASE_POOL_MAX`,同时通知运维 / 平台是否要调 pgbouncer 的 `DEFAULT_POOL_SIZE`。

**典型运维侧 pgbouncer 配置**(只是参考,**不由骨架管理**):

```ini
POOL_MODE = transaction
AUTH_TYPE = scram-sha-256
DEFAULT_POOL_SIZE = 25
MAX_CLIENT_CONN = 1000
```

---

## 10. Red Flags(写代码 / review 时立即停下来重做)

- ❌ `import { Pool } from "pg"` —— 模板用 `postgres-js`
- ❌ `db.select()` 不带 `.where(...)` 也不带 `.limit(...)`,跑在生产 list 上
- ❌ `db.insert(...)` 不经 zod parse
- ❌ `_cached.ts` 里调 `Date.now()` / `cookies()` / `headers()`
- ❌ 写完不调 `updateTag(...)` —— 用户看到旧数据
- ❌ 客户端组件直接 `import { db } from "@/lib/db"` —— build 会报 server-only
- ❌ 在 `app/api/<entity>/route.ts` 写 CRUD —— 用 Server Action
- ❌ `prepare: true`(或漏掉 `prepare: false`)
- ❌ 修改 `prepare: false` 为 `prepare: true`(若用户 Postgres 在 pgbouncer transaction mode 后面会断)
- ❌ 跨 feature 直接 `import { listNotesCached } from "@/features/notes/_cached"` —— 必须经 Server Action

---

## 11. 命令速查

```bash
pnpm db:generate          # 改了 schema 后,生成迁移 SQL
pnpm db:push              # dev:直接把 schema 推到 DB(跳过迁移文件)
pnpm db:migrate           # prod / staging:按迁移历史顺序执行
pnpm db:studio            # 起 Drizzle Studio,浏览器查数据
pnpm db:drop              # 删除某次迁移(很少用,通常 db:push 覆盖)
```

`drizzle.config.ts` 已经预置(读 `.env.local` 的 `DATABASE_URL` + `DATABASE_CASING`),一般不改。

---

## 12. 详细参考

| 文件 | 何时查 |
| --- | --- |
| [`references/advanced-schemas.md`](./references/advanced-schemas.md) | 自定义列类型(JSONB / enum / array / generated)、复合主键、索引(b-tree / 部分 / GIN / 表达式)、check 约束、relations、多租户 schema(tenant_id 列 + RLS)、软删除、命名约定 |
| [`references/query-patterns.md`](./references/query-patterns.md) | 子查询 / CTE / 原生 SQL / 批量插入 / 复杂 WHERE / 锁(`FOR UPDATE` / `SKIP LOCKED`),含 prepared statements 在 pgbouncer 下的禁忌说明 |
| [`references/performance.md`](./references/performance.md) | 连接池大小、索引策略、N+1 防御、分页(keyset)、EXPLAIN ANALYZE、pgbouncer 监控、cache backend 整合 |

> 这些 reference 已经按本骨架对齐(Postgres-only、postgres-js 驱动、pgbouncer 限制)。**没有** Prisma 对比文档 —— 骨架强制使用 Drizzle,不需要对比。

---

## 13. 跨 skill 链接

- 数据全景(Postgres + BFF + Redis + Nacos) → [`nextjs-best-practices/references/data-layer.md`](../nextjs-best-practices/references/data-layer.md)
- Server Action 三件套 / Cache Components / RSC 边界 → [`nextjs-best-practices`](../nextjs-best-practices/SKILL.md)
- Redis 应用层(rate limit / pub/sub)+ cache backend → [`redis-development`](../redis-development/SKILL.md)
- Server Action 鉴权(`getSession()` / `unauthorized()`) → [`nextjs-auth-callback`](../nextjs-auth-callback/SKILL.md)
