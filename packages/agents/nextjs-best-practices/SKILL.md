---
name: nextjs-best-practices
description: |
  **公司所有内部 Next.js 项目通用**的编码规范、代码片段范式、踩坑指南（基于 Next.js 16.2.6 + React 19.2.6 + @openconsole/{shadcn,atoms}）。无论用户怎么描述——做项目、加路由、写组件、写 Server Action、调 cookie、加环境变量、写 form、加图表、改 sidebar、调 metadata、调字体、加 features 切片、性能优化、bundle 分析、'use cache'、async params、hydration 错误、RSC 边界——只要在内部项目里**从零初始化**或**写/改/审查代码**就触发此 skill。全局核心架构约束见根目录 `AGENTS.md`；登录回调走 `nextjs-auth-callback` skill。
---

# Next.js Best Practices — 内部项目通用编码规范

## 这个 skill 干什么

只做一件事：**规范所有内部项目写代码的方式**——给出可直接照搬的代码片段，标出该用什么 API、不该写什么、为什么。

边界：

| 主题 | 在哪里 |
| --- | --- |
| 项目目录结构 / 依赖清单 / 构建命令 / 技术栈版本 | 根目录 [`AGENTS.md`](../../AGENTS.md) |
| 从零初始化项目（空目录搭骨架） | **本 skill** 的 [`references/scaffold.md`](./references/scaffold.md) |
| 外部登录回调（SSO / proxy.ts / lib/auth/* / `<Callback />`） | [`nextjs-auth-callback`](../nextjs-auth-callback/SKILL.md) skill |
| 写 page / layout / Server Action / 组件的具体范式 | **本 skill** |
| 深入到具体规则（性能、重渲、bundle……） | 本 skill 的 [`references/`](./references/) 文件夹 |

---

## 项目初始化（空目录搭骨架）

用户说"做一个 xxx APP"、"新建一个项目"、"搭一个后台"、"从零开始"时，执行以下流程：

### Step 1：用 AskUserQuestion 问 3 个关键参数

```jsonc
{
  "questions": [
    {
      "question": "项目叫什么名字？这会写进 package.json 的 name 字段。",
      "header": "项目名",
      "options": [
        { "label": "shadcn-admin", "description": "默认值，仓库通用名" },
        { "label": "my-app", "description": "示例：换成你的项目名" }
      ],
      "multiSelect": false
    },
    {
      "question": "在哪里创建？",
      "header": "位置",
      "options": [
        { "label": "在当前目录（当前目录必须是空的）", "description": "适合刚 git clone 完一个空仓库" },
        { "label": "在子目录 ./<项目名>/", "description": "在工作目录下建一个新子目录" }
      ],
      "multiSelect": false
    },
    {
      "question": "要不要顺手装登录回调？装了之后未登录访问会跳到外部登录页。",
      "header": "登录回调",
      "options": [
        { "label": "要 —— 装好后顺便配登录", "description": "搭完骨架自动调用 nextjs-auth-callback skill" },
        { "label": "先不要 —— 只搭骨架", "description": "之后可以单独说'加登录'再装" }
      ],
      "multiSelect": false
    }
  ]
}
```

### Step 2：准备目录

`ls -la` 确认目标目录为空（只允许有 `.git` / `.gitignore`）。非空就停下来问用户。子目录模式先 `mkdir <name> && cd <name>`。

### Step 3：按 [`references/scaffold.md`](./references/scaffold.md) 的文件清单逐个 Write 创建

**严格按片段内容**——除了 `package.json` 的 `"name"` 字段换成用户填的项目名以外，**不要擅自改**任何片段内容。

### Step 4：装依赖、起开发服

```bash
pnpm install
pnpm dev
```

`pnpm install` 失败大概率是 Node 版本 < 20，提示用户升级。

### Step 5：报告 + 衔接登录回调

成功后报告：
- 项目骨架位置、`pnpm dev` 端口
- 访问 http://localhost:3000/dashboard 看欢迎页
- 下一步建议：换 favicon、改 sidebar、加 feature

如果 Step 1 用户选了"要登录回调"，**直接调用** `nextjs-auth-callback` skill。

> ⚠️ **不要**用 `npx create-next-app`——生成的目录约定跟本项目冲突。

---

## 已封装好、直接用的项目 API

| 想做什么 | 用这个 | 路径 | 来源 |
| --- | --- | --- | --- |
| 读当前 session（RSC / Server Action） | `auth()` | `@/lib/auth/session` | nextjs-auth-callback |
| 给外部 API 拼 `Authorization: Bearer …` | `bearer()` | `@/lib/auth/session` | nextjs-auth-callback |
| 守护 Server Action（无 session 即跳转） | `protect()` | `@/lib/auth/guards` | nextjs-auth-callback |
| Cookie 名常量 | `TOKEN_COOKIE` / `TENANT_COOKIE` / `CONTINUE_COOKIE` | `@/lib/auth/cookies` | nextjs-auth-callback |
| 环境变量（类型安全） | `env.*` | `@/env` | 项目根 |
| Toast | `toast()` | `sonner` | npm |
| UI 基础原语（Button、Input、Dialog 等） | exports | `@openconsole/shadcn` | npm |
| UI 高阶组件（Sidebar、Header、FontProvider、ThemeProvider、LayoutProvider） | exports | `@openconsole/atoms` | npm |
| Icons | exports (PascalCase) | `lucide-react` | npm |
| 表单 | `useForm` + `zodResolver` | `react-hook-form` + `@hookform/resolvers/zod` | npm |
| URL state | `useQueryState` / `parseAsString` 等 | `nuqs` | npm |
| 主题切换 | `useTheme` | `next-themes` | npm |

**绝对不要**：

- 自己写 `getServerSession()` → 用 `auth()`
- 自己写 `cookies().get("token")` → 用 `auth()`
- 自己拼 `Bearer ${token}` → 用 `bearer()`
- 直接读 `process.env.NEXT_PUBLIC_*` → 用 `@/env` 的 `env` 对象
- 自己写 axios/fetch wrapper → 等到要加再加 `lib/http/`（参考 AGENTS.md 的 lib/ 约定）
- 引入 `@tanstack/react-query` 之外的客户端缓存库（SWR 等）

---

## 1. 异步 API（Next 16 强制 async）

`params`、`searchParams`、`cookies()`、`headers()` 都是 Promise，**没有同步版本**。

### Page / Layout

```tsx
// app/dashboard/orders/[id]/page.tsx
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

`@/lib/auth/session.ts` 的 `auth()` 就是这个范式。

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
// features/orders/server/create-order.ts
"use server";
export async function createOrder(input: { name: string }) { /* ... */ }
```

```tsx
// features/orders/components/order-form.tsx
"use client";
import { createOrder } from "@/features/orders/server/create-order";

export function OrderForm() {
  return <button onClick={() => createOrder({ name: "x" })}>Save</button>;
}
```

> ⚠️ 不要在 `features/<slice>/index.ts` 里 re-export `server/` 的函数——`"use server"` directive 必须在 import 点可见，否则客户端组件可能误以为是普通函数。详见 [`features/README.md`](../../features/README.md)。

详见 [`references/rsc/rsc-boundaries.md`](./references/rsc/rsc-boundaries.md)、[`references/rsc/directives.md`](./references/rsc/directives.md)

---

## 3. Server Action 三件套

所有 Server Action 必须做这三件事：

```ts
// features/orders/server/create-order.ts
"use server";                                  // ① 文件首行标记

import { z } from "zod";
import { protect } from "@/lib/auth/guards";  // ③ 来自 nextjs-auth-callback

const Schema = z.object({                      // ② zod 校验入参
  name: z.string().min(1).max(120),
  amount: z.number().int().positive(),
});

export async function createOrder(input: z.input<typeof Schema>) {
  await protect();                             // ③ 鉴权（动用户数据必做）
  const { name, amount } = Schema.parse(input); // ② parse 抛 ZodError

  // ④ 业务
  return { ok: true, id: "..." };              // ⑤ 返回值自动序列化
}
```

> ⚠️ Server Actions 是公开 RPC 端点，客户端能直接构造请求，**proxy.ts 拦不住没 cookie 的 Action 调用**——必须在 Action 里再 `protect()`。

参考 [`@/lib/auth/authenticate.ts`](../../lib/auth/authenticate.ts) 是项目里这个范式的样板。

详见 [`references/server/server-auth-actions.md`](./references/server/server-auth-actions.md)

---

## 4. 数据获取（项目当前姿势）

项目**没有客户端缓存库**——RSC / Server Action 直接 `await` 是默认。

### Server Component 默认姿势

```tsx
// app/dashboard/orders/page.tsx
import { protect } from "@/lib/auth/guards";
import { getOrders } from "@/features/orders/server/get-orders";
import { OrderList } from "@/features/orders";

export default async function OrdersPage() {
  await protect();
  const orders = await getOrders();
  return <OrderList orders={orders} />;
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

`app/dashboard/layout.tsx` 已经在 `<Header />` 外包了 `<Suspense>`——里面用 `useSearchParams` 才不会撞 Next 16 的 CSR bailout。

### 要加客户端缓存时

加 **TanStack Query**（生态匹配 `@tanstack/react-table`），不要混入 SWR。setup 放 `lib/query/`（参考 AGENTS.md 的 lib/ 约定）。

详见 [`references/data/data-patterns.md`](./references/data/data-patterns.md)、[`references/data/async-parallel.md`](./references/data/async-parallel.md)

---

## 5. 缓存（`'use cache'` 尚未启用）

`next.config.ts` 当前**没启** `experimental.cacheComponents`。要启用时遵守硬规则：

```ts
// ❌ 'use cache' 函数里禁止用 cookies/headers/params/Date.now()/Math.random()
"use cache";
export async function getOrders() {
  const jar = await cookies();           // ❌ 不能用
  return fetchFromAPI(jar.get("token")); // ❌ 不能用
}

// ✓ 拆成两层：deterministic 的 _cached.ts + 鉴权的 'use server' wrapper
// features/orders/server/_cached.ts
"use cache";
export async function _getOrdersCached(serviceToken: string, filters: Filters) {
  return fetchFromAPI(serviceToken, filters);
}

// features/orders/server/get-orders.ts
"use server";
import { protect } from "@/lib/auth/guards";
import { _getOrdersCached } from "./_cached";

export async function getOrders(filters: Filters) {
  await protect();
  return _getOrdersCached(env.SERVICE_TOKEN, filters);
}
```

注意：`React.cache()`（同一请求去重）≠ `'use cache'`（跨请求缓存）。`auth()` 用的是前者，可以读 cookies。

详见 [`references/rsc/directives.md`](./references/rsc/directives.md)

---

## 6. 错误处理（项目现状）

项目目前**没有** `app/error.tsx`、`app/not-found.tsx`、`app/unauthorized.tsx`、`app/forbidden.tsx`。加这些 special files 时遵守：

| 文件 | 含义 | 必须 `"use client"`? |
| --- | --- | --- |
| `app/error.tsx` | segment-level error | **是** |
| `app/global-error.tsx` | root layout 崩 | **是** |
| `app/not-found.tsx` | `notFound()` 被调 | 否 |
| `app/unauthorized.tsx` | `unauthorized()` 被调（Next 16） | 否 |
| `app/forbidden.tsx` | `forbidden()` 被调（Next 16） | 否 |

把 `protect()` 从 "redirect 到 /" 换成 401 页：

```ts
// lib/auth/guards.ts
import { unauthorized } from "next/navigation";

export async function protect(): Promise<Session> {
  const session = await auth();
  if (!session) unauthorized();   // 然后加 app/unauthorized.tsx
  return session;
}
```

详见 [`references/error-handling.md`](./references/error-handling.md)

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

3. **`React.cache()` 跨 RSC 去重**（`auth()` 是范式）。

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

`app/dashboard/layout.tsx` 已经在 `<Header />` 外包了 Suspense。

### 不要 `export const dynamic = "force-dynamic"`

`next.config.ts` 没开 `cacheComponents`，dynamic 默认就生效。强制 dynamic 反而绕过未来的 cache 优化。

详见 [`references/rsc/hydration-error.md`](./references/rsc/hydration-error.md)、[`references/rsc/suspense-boundaries.md`](./references/rsc/suspense-boundaries.md)

---

## 12. 加新 features 切片（最小 checklist）

```
features/<name>/
  schemas.ts                    zod schemas
  server/
    get-<name>.ts               "use server" — protect() + 业务
    create-<name>.ts            "use server" — protect() + 业务
  components/
    <name>-table.tsx            client UI
    <name>-form.tsx
  index.ts                      barrel — 只导 UI + types + schemas，NEVER server fns
```

路由分开放在 `app/dashboard/<name>/`：

```
app/dashboard/<name>/
  page.tsx                      列表（RSC 里 await + 传给 client 组件）
  [id]/page.tsx                 详情
```

详见 [`features/README.md`](../../features/README.md)

---

## 完整 reference 索引

本 skill 内置了 `next-best-practices` + `vercel-react-best-practices` 两套权威指南的全部内容，按主题重组，Next 15 内容已清理。

### 项目根文档

| 主题 | 文件 |
| --- | --- |
| 项目结构 + 依赖 + 命令 | [`AGENTS.md`](../../AGENTS.md) |
| 目录命名规则详解 | [`STRUCTURE.md`](../../STRUCTURE.md) |
| `lib/` 详细约定 | [`lib/README.md`](../../lib/README.md) |
| `features/` 详细约定 | [`features/README.md`](../../features/README.md) |
| 外部登录回调 | [`../nextjs-auth-callback/SKILL.md`](../nextjs-auth-callback/SKILL.md) |

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
| [`error-handling.md`](./references/error-handling.md) | error / not-found / unauthorized 三类 | 加错误页前 |

### 怎么用

- **写代码时**：先按本 SKILL.md 的项目约定写；遇到细节就按主题查到 `references/<topic>/`。
- **review 代码时**：识别违反规则类型（"瀑布请求？" → `data/async-*`、"组件重渲？" → `rerender/`），按文件夹快速翻。
- **不确定该改不改**：先看规则文件里的"为什么"。本项目用 React 19，许多手动 memo 由 Compiler 自动做（启用 `reactCompiler: true` 后），具体规则文件里会注明。
