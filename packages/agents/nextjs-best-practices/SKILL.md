---
name: nextjs-best-practices
description: |
  公司内部 Next.js 项目的统一编码规范与可复制蓝本(Next.js 16.2.6 + React 19.2.6 + Cache Components + @openconsole/{shadcn,atoms})。该 skill 自包含完整的项目骨架定义 —— **从空目录搭出统一应用结构**(`references/scaffold.md` 内含 66 个文件的逐行代码蓝本),也负责**后续业务开发**(路由 / page / layout / Server Action / `_cached.ts` / nuqs / 错误页 / metadata / hydration / RSC 边界 / 性能 / bundle)。

  必须在以下场景触发,即使用户没说出 skill 名:做项目 / 新建 Next 应用 / 搭骨架 / 初始化项目 / 加路由 / 加页面 / 写 RSC / 写 Server Action / 写 Cache Components / 用 `'use cache'` / 用 `cacheTag` / 用 `updateTag` / 写 `_cached.ts` / 加 feature 切片 / 加 nuqs / 加 metadata / 改 sidebar 数据 / 改字体 / 性能优化 / hydration mismatch / RSC 边界出错 / async params 报错 / Suspense bailout / 写 error 页 / `notFound()` / `unauthorized()` / `forbidden()` / 加 health check / 加 instrumentation。

  全局核心约束见同目录 `AGENTS.md`;外部登录回调走 `nextjs-auth-callback` skill;UI 组件用法走 `ui` skill;TanStack Query 客户端缓存走 `tanstack-query` skill;表单走 `react-hook-form` skill;ORM 写法走 `drizzle-orm` skill;Redis 走 `redis-development` skill。
---

# Next.js Best Practices — 内部项目通用编码规范

## 这个 skill 干什么

只做一件事：**规范所有内部项目写代码的方式**——给出可直接照搬的代码片段，标出该用什么 API、不该写什么、为什么。

边界：

| 主题 | 在哪里 |
| --- | --- |
| 项目目录结构 / 依赖清单 / 构建命令 / 技术栈版本 | 根目录 [`AGENTS.md`](../AGENTS.md) |
| 从零初始化项目（空目录搭骨架） | **本 skill** 的 [`references/scaffold.md`](./references/scaffold.md) |
| 外部登录回调（SSO / proxy.ts / lib/auth/* / `<Callback />`） | [`nextjs-auth-callback`](../nextjs-auth-callback/SKILL.md) skill |
| 写 page / layout / Server Action / 组件的具体范式 | **本 skill** |
| 深入到具体规则（性能、重渲、bundle……） | 本 skill 的 [`references/`](./references/) 文件夹 |

---

## 项目初始化(空目录搭骨架)

用户说「做一个 xxx APP」、「新建一个项目」、「搭一个后台」、「从零开始」时,执行以下流程。

> **关键**:骨架**不带 docker-compose**,Postgres / Redis / Nacos 都是**外部依赖**,必须先问用户拿到连接串,否则 `.env.local` 没法生成。

### Step 1:用 AskUserQuestion 问基础参数(项目身份 + 部署位置 + 登录)

```jsonc
{
  "questions": [
    {
      "question": "项目叫什么名字?这会写进 package.json 的 name、cache-handler 的 keyPrefix、Nacos 注册名等。",
      "header": "项目名",
      "options": [
        { "label": "shadcn-admin", "description": "默认值,演示用" },
        { "label": "my-app", "description": "示例:换成你的项目名(小写、连字符)" }
      ],
      "multiSelect": false
    },
    {
      "question": "在哪里创建?",
      "header": "位置",
      "options": [
        { "label": "在当前目录(当前目录必须是空的)", "description": "适合刚 git clone 完一个空仓库" },
        { "label": "在子目录 ./<项目名>/", "description": "在工作目录下建一个新子目录" }
      ],
      "multiSelect": false
    },
    {
      "question": "本应用部署后的根 URL 是什么?会写到 NEXT_PUBLIC_APP_URL,登录回来要跳回这里。",
      "header": "应用 URL",
      "options": [
        { "label": "http://localhost:3000", "description": "本地开发默认值" },
        { "label": "https://app.example.com", "description": "示例:线上域名" }
      ],
      "multiSelect": false
    },
    {
      "question": "要不要顺手装登录回调?装了之后未登录访问会跳到外部登录页。",
      "header": "登录回调",
      "options": [
        { "label": "要 —— 装好后顺便配登录", "description": "搭完骨架自动调用 nextjs-auth-callback skill,会再问登录页 URL" },
        { "label": "先不要 —— 只搭骨架", "description": "之后可以单独说「加登录」再装。.env.local 里 NEXT_PUBLIC_AUTH_URL 留空即可" }
      ],
      "multiSelect": false
    }
  ]
}
```

### Step 2:用 AskUserQuestion 问外部依赖(Postgres / Redis / Nacos)

```jsonc
{
  "questions": [
    {
      "question": "你的 Postgres 在哪里?填完整连接串。直连 5432 或经 pgbouncer transaction mode 的 6432 都行 —— lib/db/index.ts 的 prepare:false 让两种都兼容。",
      "header": "DATABASE_URL",
      "options": [
        { "label": "postgres://postgres:postgres@localhost:5432/postgres", "description": "本地直连示例" },
        { "label": "postgres://app:<pwd>@db.internal:6432/app", "description": "示例:经 pgbouncer 的内网 Postgres" }
      ],
      "multiSelect": false
    },
    {
      "question": "你的 Redis 在哪里?用于应用层(rate limit / pub-sub / 临时状态)+ Next cache backend(跨实例共享 `'use cache'`)。",
      "header": "REDIS_URL",
      "options": [
        { "label": "redis://localhost:6379", "description": "本地无密码示例" },
        { "label": "redis://:<pwd>@redis.internal:6379/0", "description": "示例:带密码 + db 编号" }
      ],
      "multiSelect": false
    },
    {
      "question": "需要 Nacos 服务发现吗?用于本服务注册 + 调用其它内部服务(`nacos://service-name/...`)。",
      "header": "Nacos",
      "options": [
        { "label": "不需要 —— 跳过", "description": ".env.local 里 NACOS_* 全删,NACOS_PROVIDER_ENABLED=false。本服务跑不上 Nacos,但也不调其它服务" },
        { "label": "需要 —— 接着问 server / 命名空间 / 账号", "description": "下一步再问 NACOS_SERVER / NAMESPACE / USERNAME / PASSWORD" }
      ],
      "multiSelect": false
    }
  ]
}
```

如果用户在「Nacos」选了「需要」,**再追问 4 个值**:

```jsonc
{
  "questions": [
    { "question": "NACOS_SERVER 地址?(如 nacos.internal:8848,无 http:// 前缀)", "header": "NACOS_SERVER",
      "options": [
        { "label": "127.0.0.1:8848", "description": "本地默认" },
        { "label": "nacos.internal:8848", "description": "示例:内网 Nacos" }
      ], "multiSelect": false },
    { "question": "NACOS_NAMESPACE?", "header": "NACOS_NAMESPACE",
      "options": [
        { "label": "public", "description": "默认命名空间" },
        { "label": "<your-namespace>", "description": "示例:按环境分(dev/staging/prod)" }
      ], "multiSelect": false },
    { "question": "NACOS_USERNAME?", "header": "用户名",
      "options": [
        { "label": "nacos", "description": "默认账号" },
        { "label": "<your-user>", "description": "示例" }
      ], "multiSelect": false },
    { "question": "NACOS_PASSWORD?", "header": "密码",
      "options": [
        { "label": "nacos", "description": "默认密码" },
        { "label": "<your-password>", "description": "示例" }
      ], "multiSelect": false }
  ]
}
```

> 用户的回答最终都会落到 `.env.local`(`scaffold/root.md` [2])里,占位符 `<DATABASE_URL>` / `<REDIS_URL>` / `<NACOS_*>` 一并替换。

### Step 3:准备目录

`ls -la` 确认目标目录为空(只允许有 `.git` / `.gitignore`)。非空就停下来问用户。子目录模式先 `mkdir <name> && cd <name>`。

### Step 4:按 [`references/scaffold.md`](./references/scaffold.md) 的文件清单逐个 Write 创建

按 scaffold.md 的「按推荐顺序」表(root → config → lib → features-auth → features-notes → app → drizzle → public)逐目录 Write。所有占位符替换:

| 占位符 | 来源 |
| --- | --- |
| `<PROJECT_NAME>` | Step 1 问题 1 |
| `<PROJECT_DISPLAY_NAME>` | Step 1 问题 1(可与 `<PROJECT_NAME>` 相同,或加首字母大写) |
| `<SERVICE_NAME>` | Step 1 问题 1(Nacos 注册名;若不接 Nacos 可忽略) |
| `<DEFAULT_REDIRECT>` | 默认 `/dashboard`,除非用户明确想换 |
| `<NEXT_PUBLIC_APP_URL>` | Step 1 问题 3 |
| `<NEXT_PUBLIC_AUTH_URL>` | Step 1 问题 4(选「要登录回调」)→ 调 `nextjs-auth-callback` skill 时会再问 |
| `<DATABASE_URL>` | Step 2 问题 1 |
| `<REDIS_URL>` | Step 2 问题 2 |
| `<NACOS_*>` | Step 2 问题 3(+ 追问) |

**除占位符替换外**,scaffold 片段内容**不要擅自改**。

### Step 5:装依赖、起开发服

```bash
pnpm install
pnpm db:push   # 让 drizzle-kit 把 schema 推到用户的 Postgres
pnpm dev
```

`pnpm install` 失败大概率是 Node 版本 < 22.11,提示用户升级。`pnpm db:push` 失败一般是 `DATABASE_URL` 不通 —— 让用户 `psql $DATABASE_URL` 直连验证。

### Step 6:报告 + 衔接登录回调

成功后报告:
- 项目骨架位置、`pnpm dev` 端口
- 访问 http://localhost:3000/dashboard 看欢迎页(若装了登录回调,会先跳外部登录)
- 下一步建议:换 favicon、改 sidebar、加 feature

如果 Step 1 用户选了「要登录回调」,**直接调用** `nextjs-auth-callback` skill。

> ⚠️ **不要**用 `npx create-next-app` —— 生成的目录约定跟本骨架冲突。
> ⚠️ **不要**自己生成 `docker/docker-compose.yaml` —— 骨架不带,外部依赖由运维 / 平台提供。

---

## 已封装好、直接用的项目 API

| 想做什么 | 用这个 | 路径 | 来源 |
| --- | --- | --- | --- |
| 读当前 session(RSC / Server Action) | `getSession()` | `@/features/auth/server/session` | scaffold 自带 |
| 给 BFF 调用注入 token / tenant_code 头 | `getSessionHeaders()` | `@/features/auth/server/session` | scaffold 自带 |
| 守护 Server Action(无 session 即触发 401 页) | `unauthorized()` | `next/navigation`(Next 16) | 标准 API |
| 写 cookie(SSO callback 写 token) | `setSession({ token, tenantCode })` | `@/features/auth/actions` | scaffold 自带 |
| Cookie 名常量 | `env.COOKIE_TOKEN` / `env.COOKIE_TENANT_CODE` / `env.COOKIE_CONTINUE` | `@/env` | scaffold 自带 |
| 环境变量(类型安全) | `env.*` | `@/env` | scaffold 自带 |
| BFF 调用 + envelope 拆解 | `request` + `safeUnwrap(Schema, ...)` | `@/lib/request` | scaffold 自带 |
| 数据库 | `db` + Drizzle | `@/lib/db` | scaffold 自带 |
| 应用层 Redis | `redis` | `@/lib/redis` | scaffold 自带 |
| 调其它内部服务 | `client().fetch("nacos://service/path")` | `@openconsole/nacos` | npm |
| 日志 | `scoped(tag)` | `@/lib/logger` | scaffold 自带 |
| Toast | `toast()` | `sonner` | npm |
| UI 基础原语(Button、Input、Dialog 等) | exports | `@openconsole/shadcn` | npm |
| UI 高阶组件(Sidebar、Header、LayoutProvider 等) | exports | `@openconsole/atoms` | npm |
| Icons | exports (PascalCase) | `lucide-react` | npm |
| 表单 | `useForm` + `zodResolver` | `react-hook-form` + `@hookform/resolvers/zod` | npm |
| URL state | `useQueryState` / `parseAsString` 等 | `nuqs` | npm |
| 主题切换 | `useTheme` | `next-themes`(用 atoms `<ThemeSwitch>` 直接) | npm |

**绝对不要**:

- 自己写 `getServerSession()` → 用 `getSession()`
- 自己写 `cookies().get("token")` → 用 `getSession()`(`React.cache` 包过,一请求只读一次)
- 自己拼 `Authorization: Bearer ${token}` → 用 `request` 客户端,头自动注入
- 直接读 `process.env.NEXT_PUBLIC_*` → 用 `@/env` 的 `env` 对象
- 自己写 axios/fetch wrapper → 用模板已有的 `@/lib/request`(BFF envelope + 自动 session 头注入)
- 引入 `@tanstack/react-query` 之外的客户端缓存库(SWR 等)

---

## 1. 异步 API（Next 16 强制 async）

`params`、`searchParams`、`cookies()`、`headers()` 都是 Promise，**没有同步版本**。

### Page / Layout

```tsx
// app/(dashboard)/orders/[id]/page.tsx
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab } = await searchParams;
  // ...
}
```

### Server-side cookies / headers

```ts
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";

// React.cache() 让同一 RSC 请求里多处调用只读一次
export const readTheme = cache(async () => {
  const jar = await cookies();
  return jar.get("theme")?.value ?? "system";
});
```

`@/features/auth/server/session.ts` 的 `getSession()` 就是这个范式 ——
模板已经内置(scaffold 第 [52] 项)。

详见 [`references/data/async-patterns.md`](./references/data/async-patterns.md)

---

## 2. RSC 边界

### Server vs Client component 一眼判断

| 文件首行 | 类型 | 能 `await cookies()` / 直接 fetch 后端 |
| --- | --- | --- |
| 没有 `"use client"` | Server Component（默认） | ✓ |
| `"use client"` | Client Component | ✗ |

### 传给客户端的 props 必须 JSON 可序列化

不能传：函数（**Server Action 除外**）、`Date`、`Map` / `Set`、class 实例、循环引用、`Symbol`。

```tsx
// ❌ Date 会被序列化成 string，客户端调 .getFullYear() 崩
<PostCard createdAt={post.createdAt} />

// ✓ 服务端先 toISOString，客户端拿 string
<PostCard createdAt={post.createdAt.toISOString()} />
```

### Server Action 是唯一可传函数的例外

```tsx
// features/orders/actions.ts
"use server";
export async function createOrder(input: { name: string }) { /* ... */ }
```

```tsx
// features/orders/components/order-form.tsx
"use client";
import { createOrder } from "@/features/orders/actions";

export function OrderForm() {
  return <button onClick={() => createOrder({ name: "x" })}>Save</button>;
}
```

> ⚠️ 不要在 `features/<slice>/index.ts` 里 re-export `actions.ts` 的函数 —— `"use server"` directive 必须在 import 点可见,否则客户端组件可能误以为是普通函数。详见 [`references/features.md`](./references/features.md)。

详见 [`references/rsc/rsc-boundaries.md`](./references/rsc/rsc-boundaries.md)、[`references/rsc/directives.md`](./references/rsc/directives.md)

---

## 3. Server Action 三件套

所有 Server Action 必须做这三件事:

```ts
// features/orders/actions.ts
"use server";                                  // ① 文件首行标记

import { z } from "zod";
import { unauthorized } from "next/navigation";

import { getSession } from "@/features/auth/server/session";

const Schema = z.object({                      // ② zod 校验入参
  name: z.string().min(1).max(120),
  amount: z.number().int().positive(),
});

export async function createOrder(input: z.input<typeof Schema>) {
  // ③ 鉴权(操作用户数据必做)
  const session = await getSession();
  if (!session) unauthorized();                // 触发 app/unauthorized.tsx

  const { name, amount } = Schema.parse(input); // ② parse 抛 ZodError

  // ④ 业务
  return { ok: true, id: "..." };              // ⑤ 返回值自动序列化
}
```

> ⚠️ Server Actions 是公开 RPC 端点,客户端能直接构造请求,**proxy.ts 拦不住没 cookie 的 Action 调用** —— 必须在 Action 里再做 session 检查。

如果跨多个 action 复用,可以抽一个 `protect()` helper:

```ts
// features/auth/server/guard.ts
import "server-only";
import { unauthorized } from "next/navigation";
import { getSession } from "./session";

export async function protect() {
  const session = await getSession();
  if (!session) unauthorized();
  return session;
}
```

详见 [`references/server/server-auth-actions.md`](./references/server/server-auth-actions.md) 和 [`references/data-layer.md`](./references/data-layer.md)

---

## 4. 数据获取(项目当前姿势)

项目有 **TanStack Query**(`@tanstack/react-query`,客户端缓存)和
**Cache Components**(`'use cache'`,服务端缓存)两层。RSC / Server Action
直接 `await` 是默认;客户端通过 `useSuspenseQuery` 拿 server-action queryFn 的
结果,用 `initialData` 喂入。

### Server Component 默认姿势

```tsx
// app/(dashboard)/orders/page.tsx
import { Suspense } from "react";

import { listOrders } from "@/features/orders/actions";
import { OrdersTable } from "@/features/orders/components/orders-table";

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersSkeleton />}>
      <OrdersShell />
    </Suspense>
  );
}

async function OrdersShell() {
  const data = await listOrders();             // Server Action,内部转发到 _cached
  return <OrdersTable initialData={data} />;
}
```

### 多个独立请求并行

```tsx
// ❌ 串行：耗时累加
const user = await getUser();
const orders = await getOrders();

// ✓ 并行：取 max
const [user, orders] = await Promise.all([getUser(), getOrders()]);
```

### Suspense 流式（让慢内容不阻塞快内容）

```tsx
import { Suspense } from "react";

export default function Page() {
  return (
    <>
      <FastHeader />
      <Suspense fallback={<Skeleton />}>
        <SlowList />
      </Suspense>
    </>
  );
}
```

`app/(dashboard)/layout.tsx` 已经在 `<Header />` 外包了 `<Suspense>` —— 里面用 `useSearchParams` 才不会撞 Next 16 的 CSR bailout。

### 客户端缓存

`@tanstack/react-query` 已经预装,setup 在 `lib/query/`。详见
[`references/data-layer.md`](./references/data-layer.md) 的「前端拿数据」段。
**禁止**混入 SWR。

详见 [`references/data/data-patterns.md`](./references/data/data-patterns.md)、[`references/data/async-parallel.md`](./references/data/async-parallel.md)

---

## 5. 缓存(`'use cache'` 已启用 + 跨实例 Redis)

`next.config.ts` 的 `cacheComponents: true` 已开;`cache-handler.mjs` 让多实例
间通过 Redis 共享 `revalidateTag` / `updateTag`。硬规则:

```ts
// ❌ 'use cache' 函数里禁止用 cookies/headers/Date.now()/Math.random()
"use cache";
export async function getOrders() {
  const jar = await cookies();           // ❌ 不能用
  return fetchFromAPI(jar.get("token")); // ❌ 不能用
}

// ✓ 拆成两层:deterministic 的 _cached.ts + 鉴权的 'use server' wrapper
// features/orders/_cached.ts
import "server-only";
import { cacheLife, cacheTag } from "next/cache";

export async function _getOrdersCached(filters: Filters) {
  "use cache";
  cacheLife("hours");
  cacheTag("orders:list");
  return db.query.orders.findMany({ where: ... });
}

// features/orders/actions.ts
"use server";
import { updateTag } from "next/cache";

import { _getOrdersCached } from "./_cached";

export async function getOrders(filters: Filters) {
  // 鉴权:Server Action 里读 cookies 没问题,只是不能在 _cached.ts 里
  const session = await getSession();
  if (!session) unauthorized();
  return _getOrdersCached(filters);
}
```

注意:`React.cache()`(同一请求去重)≠ `'use cache'`(跨请求缓存)。
`getSession()` 用的是前者(`import { cache } from "react"`),可以读 cookies。

详见 [`references/rsc/directives.md`](./references/rsc/directives.md)

---

## 6. 错误处理

模板里 5 个 special files 都已经实现,用 atoms 的现成组件渲染:

| 文件 | 含义 | 必须 `"use client"`? | 模板组件 |
| --- | --- | --- | --- |
| `app/error.tsx` | segment-level error | **是** | atoms `<ServerError>` |
| `app/global-error.tsx` | root layout 崩 | **是** | atoms `<ServerError>`(自渲 `<html>`) |
| `app/not-found.tsx` | `notFound()` 被调 | 否 | atoms `<NotFound>` |
| `app/unauthorized.tsx` | `unauthorized()` 被调 | 否 | atoms `<Unauthorized>` |
| `app/forbidden.tsx` | `forbidden()` 被调 | 否 | atoms `<Forbidden>` |

`unauthorized()` / `forbidden()` 需要 `next.config.ts` 的
`experimental.authInterrupts: true`(模板已开)。

**禁止**:

- 自己画 404 / 401 / 500 页面 —— 用 atoms 组件
- 在 Server Action 里 `throw new Response("401", ...)` —— 用 `unauthorized()`

详见 [`references/error-pages.md`](./references/error-pages.md)

---

## 7. UI / 字体 / Metadata

### 字体

`app/layout.tsx` 已经载好 4 个 Google 字体（Geist Sans / Mono / Inter / Manrope）。新页面**不要再载额外字体**——用现成 CSS 变量：

```tsx
<div className="font-mono">{code}</div>          // var(--font-geist-mono)
<h1 className="[font-family:var(--font-manrope)]">{title}</h1>
```

`<FontProvider>` 让用户在 inter / manrope / system 之间切——别动 root layout 里的引导脚本。

详见 [`references/ui/font.md`](./references/ui/font.md)

### Metadata

```tsx
// 静态
export const metadata: Metadata = {
  title: "Orders",
  description: "Manage your orders",
};

// 动态（依赖 params）
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order #${id}` };
}
```

Root `app/layout.tsx` 已经设了默认 title——子页面会覆盖。

详见 [`references/ui/metadata.md`](./references/ui/metadata.md)

### 图片

永远用 `next/image`，绝不用裸 `<img>`。外部图片域要在 `next.config.ts` 的 `images.remotePatterns` 加白名单：

```ts
// next.config.ts
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.example.com" },
    ],
  },
};
```

详见 [`references/ui/image.md`](./references/ui/image.md)

### Icons

只用 `lucide-react`。

```tsx
// React 组件代码里：直接 import 真组件
import { LayoutDashboard } from "lucide-react";
<LayoutDashboard className="size-4" />

// config/sidebar.ts 里：PascalCase 字符串（要序列化到 client，不能传函数）
{ icon: "LayoutDashboard" }
```

---

## 8. Form 范式（react-hook-form + zod）

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input } from "@openconsole/shadcn";
import { toast } from "sonner";

import { createOrder } from "@/features/orders/server/create-order";

const FormSchema = z.object({
  name: z.string().min(1, "必填"),
  amount: z.coerce.number().int().positive(),
});

type FormInput = z.input<typeof FormSchema>;

export function OrderForm() {
  const form = useForm<FormInput>({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: "", amount: 0 },
  });

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      await createOrder(data);
      toast.success("已创建");
    } catch (err) {
      toast.error("创建失败");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input {...form.register("name")} />
      <Input type="number" {...form.register("amount")} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        保存
      </Button>
    </form>
  );
}
```

要点：

- Server Action 的 zod schema **必须**独立于这里的 `FormSchema`，**两边都要校验**（客户端可被绕过）。
- `z.input<typeof Schema>` 是表单输入类型（含 `z.coerce` 之前），`z.infer<typeof Schema>` 是 parse 后的类型。

---

## 9. URL State（nuqs）

list / filter / pagination 永远走 URL，不要存 `useState`——刷新页面、分享链接都得保留状态。

```tsx
"use client";

import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";

const filters = {
  q: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
};

export function useOrderFilters() {
  return useQueryStates(filters, { shallow: false });
}
```

Server Component 端读：

```tsx
import { createSearchParamsCache } from "nuqs/server";

const cache = createSearchParamsCache(filters);

export default async function OrdersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { q, page } = await cache.parse(await searchParams);
  // ...
}
```

记得 root layout 已经包 `<NuqsAdapter>`，不用再包。

---

## 10. 性能（高 ROI 规则）

详见 [`references/performance.md`](./references/performance.md) 的优先级排序。本项目实际相关的几条：

1. **不在组件里定义内嵌组件**：

   ```tsx
   // ❌ 每次 render 新对象，React 视为新组件
   function Outer() {
     function Inner() { return <div /> }
     return <Inner />;
   }

   // ✓ 提出去
   function Inner() { return <div /> }
   function Outer() { return <Inner /> }
   ```

2. **派生状态在 render 里直接算**，别 `useState + useEffect` 凑：

   ```tsx
   // ❌
   const [doubled, setDoubled] = useState(0);
   useEffect(() => setDoubled(value * 2), [value]);

   // ✓
   const doubled = value * 2;
   ```

3. **`React.cache()` 跨 RSC 去重**(`getSession()` 是范式)。

4. **不要 `"use client"` + `async function`**——客户端组件不能 async。要异步加载数据用 `useEffect` 或 React 19 的 `use()` hook。

5. **全页跳转用 `window.location.replace`**——刚写完 cookie / 需要完整 hydrate 时比 `router.replace` 更可靠（`features/auth/components/callback.tsx` 就是因为这个用了 `window.location.replace`）。日常路由跳转用 `router.replace`。

React 19 Compiler 自动 memo——本项目 `next.config.ts` 当前**没开** `reactCompiler: true`。开启时确认依赖兼容（`recharts` / `@radix-ui` 等通常没问题）。

---

## 11. 常见陷阱

### Hydration mismatch

`app/layout.tsx` 已加 `suppressHydrationWarning` 在 `<html>` 上——因为 `<script>` 在 hydration 前改 `class`（fontProvider boot script）。新代码里：

```tsx
// ❌ 服务端没有 window，客户端 hydrate 时不一致 → mismatch
function Component() {
  const isMobile = window.innerWidth < 768;
  return <div className={isMobile ? "mobile" : "desktop"} />;
}

// ✓ 读浏览器 API 包 useEffect
function Component() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => setIsMobile(window.innerWidth < 768), []);
  return <div className={isMobile ? "mobile" : "desktop"} />;
}

// 或者用 next/dynamic 关 SSR
const Heavy = dynamic(() => import("./Heavy"), { ssr: false });
```

### `useSearchParams` 必须包 `<Suspense>`

```tsx
// ❌ 没包 Suspense，Next 16 抛 CSR bailout
"use client";
import { useSearchParams } from "next/navigation";
export default function Page() {
  const sp = useSearchParams();
  return <div>{sp.get("tab")}</div>;
}

// ✓ 在父级包 Suspense（或在 page.tsx 包整个 component）
<Suspense fallback={<Skeleton />}>
  <SearchParamsConsumer />
</Suspense>
```

`app/(dashboard)/layout.tsx` 已经在 `<Header />` 外包了 Suspense;atoms 的
`<LayoutProvider>` / `<SidebarProvider>` 内置 Suspense,也不需要在调用点再包。

### 不要 `export const dynamic = "force-dynamic"`

`next.config.ts` 已开 `cacheComponents: true`,任何用了 cookies/headers/params
的 component 自动按 dynamic 处理。强制 dynamic 反而绕过 cache 优化。

详见 [`references/rsc/hydration-error.md`](./references/rsc/hydration-error.md)、[`references/rsc/suspense-boundaries.md`](./references/rsc/suspense-boundaries.md)

---

## 12. 加新 features 切片(最小 checklist)

```
features/<name>/
  schemas.ts                    zod schemas(单一事实来源)
  types.ts                      从 schemas 派生 + 纯 TS 类型(可选)
  actions.ts                    "use server" —— Server Actions(读 + 写 + updateTag)
  _cached.ts                    "use cache" —— 缓存读(可选)
  components/
    <name>-table.tsx
    <name>-form.tsx
    <name>-delete-dialog.tsx    (如果有删除)
  queries/
    keys.ts                     query key 工厂
    options.ts                  queryOptions(queryKey + queryFn = action)
  contexts/                     React Context(可选)
  hooks/                        自定义 hooks(可选)
  server/                       仅服务端工具,不是 Server Action(可选)
```

路由分开放在 `app/(dashboard)/<name>/`:

```
app/(dashboard)/<name>/
  page.tsx                      列表(RSC 里 await action → 传 initialData)
  [id]/page.tsx                 详情
```

**禁止**:`features/<name>/index.ts` 里 re-export `actions.ts` —— `"use server"`
必须在 import 点可见。

详见 [`references/features.md`](./references/features.md)

---

## 完整 reference 索引

本 skill 内置了 `next-best-practices` + `vercel-react-best-practices` 两套权威指南的全部内容，按主题重组，Next 15 内容已清理。

### 项目根文档

| 主题 | 文件 |
| --- | --- |
| 公司级硬约束 + 技术栈 + 五条硬规则 | [`AGENTS.md`](../AGENTS.md) |
| 外部登录回调 | [`../nextjs-auth-callback/SKILL.md`](../nextjs-auth-callback/SKILL.md) |
| UI 组件 / 主题 / 防闪烁 | [`../ui/SKILL.md`](../ui/SKILL.md) |

### 项目骨架 + 强约束

| 文件 | 何时查 |
| --- | --- |
| [`references/scaffold.md`](./references/scaffold.md) | 从零初始化 —— 逐文件 Write 的完整蓝本(66 个文件) |
| [`references/directory-structure.md`](./references/directory-structure.md) | 每个目录的能放/不能放、根目录的禁止列表 |
| [`references/configs.md`](./references/configs.md) | env / next.config / proxy / instrumentation / cache-handler / drizzle.config 每一项的语义 |
| [`references/data-layer.md`](./references/data-layer.md) | Drizzle / Cache Components / Redis / BFF envelope / TanStack Query 全图 |
| [`references/features.md`](./references/features.md) | 加新 feature 切片的完整流程 + 速查表 |
| [`references/error-pages.md`](./references/error-pages.md) | 5 个 special files + `(errors)/*` 路由组 + auth interrupts |
| [`references/checklist.md`](./references/checklist.md) | pre-commit / review / 部署 / 排障四套清单 |

### 本 skill references/（按主题）

| 文件夹 | 内容 | 何时查 |
| --- | --- | --- |
| [`routing/`](./references/routing/) | file-conventions、route-handlers、parallel-routes、runtime-selection | 加路由 / 写 `app/api/<x>/route.ts` |
| [`rsc/`](./references/rsc/) | rsc-boundaries、directives、functions、hydration-error、suspense-boundaries | Server/Client 边界出错 / 三种 directive 选哪个 |
| [`data/`](./references/data/) | data-patterns、async-patterns、async-* 并行规则、server-cache、client-swr-dedup | 选 RSC / Action / Route Handler，做数据并行 |
| [`server/`](./references/server/) | server-auth-actions、after-nonblocking、hoist-static-io | Server Action 鉴权、`after()` 非阻塞、静态 IO 提模块级 |
| [`bundle/`](./references/bundle/) | bundling、barrel-imports、dynamic-imports、conditional、defer-third-party、preload | 包体积 / 第三方脚本 |
| [`rendering/`](./references/rendering/) | 11 条 rendering-* | 动画 / content-visibility / hoist-jsx 等 |
| [`rerender/`](./references/rerender/) | 15 条 rerender-* | 减少不必要重渲染 |
| [`client/`](./references/client/) | client-event-listeners、passive-event-listeners | 客户端事件 |
| [`ui/`](./references/ui/) | image、font、metadata、scripts | UI 主题 |
| [`js/`](./references/js/) | 13 条 js-* 微优化 | profiling 看到具体热点再查 |
| [`ops/`](./references/ops/) | debug-tricks、self-hosting | Docker / standalone / MCP 调试 |
| [`advanced/`](./references/advanced/) | event-handler-refs、init-once、use-latest | 高级模式（按需） |
| [`AGENTS.md`](./references/AGENTS.md) | 3300+ 行 React 性能总览 | 想一次性看全 |
| [`performance.md`](./references/performance.md) | 项目相关性能优先级排序 | 优化前 |
| [`error-pages.md`](./references/error-pages.md) | 5 个 special files + `(errors)/*` 路由组 + auth interrupts | 加错误页前 |

### 怎么用

- **写代码时**：先按本 SKILL.md 的项目约定写；遇到细节就按主题查到 `references/<topic>/`。
- **review 代码时**：识别违反规则类型（"瀑布请求？" → `data/async-*`、"组件重渲？" → `rerender/`），按文件夹快速翻。
- **不确定该改不改**：先看规则文件里的"为什么"。本项目用 React 19，许多手动 memo 由 Compiler 自动做（启用 `reactCompiler: true` 后），具体规则文件里会注明。
