# Opentemplate — 全局架构与硬约束

> 本文件是 `opentemplate` skill 的「宪法」。SKILL.md 是触发器和工作流,AGENTS.md
> 是不可妥协的规则。所有由 AI 生成或修改的代码都必须能通过本文件每一项检查。

---

## 0. 一句话定位

**Opentemplate** 是公司内部所有 Next.js 16 应用的统一起点。它把:

- Next.js 16 App Router + Cache Components + React Compiler
- React 19.2 + Tailwind v4 + shadcn/ui(经 `@openconsole/{atoms,shadcn}` 封装)
- Drizzle ORM + Postgres(经 pgbouncer)+ Redis(共享 cache backend)
- Nacos 服务注册 + SSO 回调 + 标准 `{code,data,msg}` envelope BFF
- 主题色 `#17b3a3`、防闪烁 cookie 持久化、统一错误页

打包成一个可立即开发的脚手架。**目标:每个 AI 生成的内部 APP 必须长得一样,任何细节漂移都需要 review 退回。**

---

## 1. 技术栈版本(强一致,禁止 drift)

| 类别 | 包 | 版本 | 备注 |
| --- | --- | --- | --- |
| 框架 | `next` | `16.2.6` | App Router + Cache Components 启用 |
| React | `react` / `react-dom` | `19.2.6` | Compiler 已启用 |
| 语言 | `typescript` | `^6.0.3` | `strict: true` + `verbatimModuleSyntax: true` |
| 样式 | `tailwindcss` | `^4.3.0` | v4 zero-config,入口 `globals.css` |
| PostCSS | `@tailwindcss/postcss` | `^4.3.0` | 唯一 PostCSS 插件 |
| UI 原语 | `@openconsole/shadcn` | `0.2.1` | shadcn/ui 全集 + 主题 token |
| UI 业务级 | `@openconsole/atoms` | `0.2.1` | Header / Sidebar / Preferences / Provider |
| Nacos 客户端 | `@openconsole/nacos` | `0.2.1` | 零配置,读 `NACOS_*` env |
| 图标 | `lucide-react` | `^1.16.0` | 唯一图标库 |
| 主题切换 | `next-themes` | `^0.4.6` | 已被 atoms 的 `<ThemeProvider>` 包装 |
| Toast | `sonner` | `^2.0.7` | 通过 `@openconsole/shadcn` 的 `<Toaster>` 挂载 |
| 客户端缓存 | `@tanstack/react-query` | `^5.100.14` | **唯一**客户端缓存库,禁止 SWR |
| Devtools | `@tanstack/react-query-devtools` | `^5.100.14` | dev only |
| 表格 | `@tanstack/react-table` | `^8.21.3` | |
| URL 状态 | `nuqs` | `^2.8.9` | list / filter / pagination 必走 URL |
| 表单 | `react-hook-form` | `^7.76.0` | + `@hookform/resolvers@^5.2.2` |
| 校验 | `zod` | `^4.4.3` | 客户端 + Server Action 双校验 |
| HTTP | `ofetch` | `^1.5.1` | BFF 调用,封装在 `lib/request/` |
| ORM | `drizzle-orm` | `^0.45.2` | + `drizzle-kit@^0.31.10` |
| Postgres 客户端 | `postgres` | `^3.4.9` | 通过 pgbouncer 连接 |
| Redis 客户端 | `ioredis` | `^5.10.1` | 应用层使用 |
| Redis 客户端(cache-handler) | `redis` | `^4.7.0` | `@neshca/cache-handler` 强制依赖 |
| Next cache backend | `@neshca/cache-handler` | `^1.9.0` | 生产构建专用 |
| 进度条 | `nextjs-toploader` | `^3.9.17` | 顶部进度条 |
| Env 校验 | `@t3-oss/env-nextjs` | `^0.13.11` | `env.ts` 唯一入口 |
| Server 守护 | `server-only` | `^0.0.1` | 标记仅服务端文件 |
| 日期 | `date-fns` | `^4.2.1` | 唯一日期库 |
| 日历 | `react-day-picker` | `^9.14.0` | + atoms `<Calendar>` |
| 日志 | `consola` | `^3.4.2` | `lib/logger.ts` 唯一入口 |
| 容器 | `vaul` | `^1.1.2` | shadcn Drawer 依赖 |
| Radix | `radix-ui` 及 `@radix-ui/*` | 见 package.json | shadcn 依赖,**不要**自己直接 import |
| 包管理器 | `pnpm` | — | engines 强制 |

**禁止新增**:

- 其它 UI 库(MUI / Antd / Chakra / Mantine 等)
- 其它客户端缓存(SWR、Apollo Client 等)
- 其它表单库(Formik、Final Form 等)
- 其它日期库(moment、dayjs)
- 其它 HTTP 客户端(axios)—— 用 `ofetch`
- 其它 ORM(Prisma、TypeORM)

要新增依赖前先在 PR 描述里说明为什么现有依赖不够。

---

## 2. 目录结构(严格约定)

```
<project-root>/
├── app/                                # App Router —— 只放路由 + special files
│   ├── layout.tsx                      # 根布局:html / body / 全局 Provider 链
│   ├── globals.css                     # Tailwind v4 入口 + 业务字体变量
│   ├── page.tsx                        # `/` —— SsoCallback 接收 token fragment
│   ├── error.tsx                       # segment-level error boundary
│   ├── global-error.tsx                # root error boundary(渲染自己的 <html>)
│   ├── not-found.tsx                   # `notFound()` 触发
│   ├── unauthorized.tsx                # `unauthorized()` 触发(Next 16)
│   ├── forbidden.tsx                   # `forbidden()` 触发(Next 16)
│   ├── (dashboard)/                    # 路由组 —— 共享 Dashboard 骨架
│   │   ├── layout.tsx                  # AuthProvider + LayoutProvider + SidebarProvider + Sidebar + Header
│   │   ├── dashboard/page.tsx
│   │   └── <feature>/page.tsx          # 每个 feature 一条路由
│   ├── (errors)/                       # 路由组 —— 直接可访问的错误页(不是 boundary)
│   │   ├── error/page.tsx
│   │   ├── forbidden/page.tsx
│   │   ├── maintenance/page.tsx
│   │   ├── not-found/page.tsx
│   │   └── unauthorized/page.tsx
│   └── api/
│       └── health/route.ts             # k8s liveness/readiness probe
│
├── features/                           # 业务领域切片 —— 业务代码全部在这
│   └── <domain>/
│       ├── actions.ts                  # "use server" —— Server Actions(失效缓存 + 业务)
│       ├── _cached.ts                  # "use cache" 包装的读 —— 不能读 cookies/headers
│       ├── schemas.ts                  # zod schemas(单一事实来源)
│       ├── types.ts                    # 从 schemas 派生的类型 + 其它 TS-only 类型
│       ├── components/                 # 该 feature 的 React 组件
│       ├── contexts/                   # 该 feature 的 React Context(可选)
│       ├── hooks/                      # 自定义 hooks(可选)
│       ├── queries/                    # TanStack Query 选项 + key
│       │   ├── keys.ts
│       │   └── options.ts
│       └── server/                     # 仅服务端的工具(session 读取等;非 Server Action)
│
├── lib/                                # 基建 —— 跨 feature 复用
│   ├── db/                             # Drizzle 客户端 + schema
│   │   ├── index.ts                    # `db` 单例 + globalThis 缓存避免 HMR 泄漏
│   │   └── schema/                     # 每张表一个文件 + 桶式 index.ts
│   ├── redis/                          # ioredis 客户端单例
│   ├── query/                          # TanStack QueryClient + QueryClientProvider
│   ├── request/                        # BFF ofetch 客户端 + envelope 协议
│   └── logger.ts                       # consola 日志单例 + scoped factory
│
├── config/                             # 静态配置(无副作用,可在 server / client 共享)
│   ├── site.ts                         # name / description / defaultRedirect
│   └── sidebar.ts                      # 侧边栏菜单数据(icon 是 PascalCase 字符串)
│
├── contexts/                           # 跨 feature 的全局 Context(可选;默认空)
│
├── drizzle/                            # drizzle-kit 生成的迁移
│   ├── 0000_*.sql                      # 提交进 git
│   └── meta/                           # 提交进 git(_journal.json.lock 除外)
│
├── docker/                             # 本地开发依赖容器
│   └── docker-compose.yaml             # pgbouncer + nacos
│
├── public/                             # 静态资源(favicon 等)
│
├── package.json
├── pnpm-workspace.yaml                 # 锁 `@openconsole/*` 不走 minimum-release-age
├── pnpm-lock.yaml                      # 提交进 git
├── tsconfig.json                       # paths: { "@/*": "./*" }
├── next.config.ts                      # standalone / cacheComponents / reactCompiler / cacheHandler / transpilePackages
├── next-env.d.ts                       # Next 自动生成,**.gitignore 已忽略**
├── postcss.config.mjs                  # 只有 @tailwindcss/postcss
├── env.ts                              # @t3-oss/env-nextjs 校验
├── proxy.ts                            # Next 16 middleware(改名为 proxy.ts)
├── instrumentation.ts                  # Nacos init + onRequestError 日志
├── cache-handler.mjs                   # @neshca/cache-handler + Redis(生产)/LRU(fallback)
├── drizzle.config.ts                   # drizzle-kit 配置
├── .env.local                          # 本地开发 env(**.gitignore 已忽略**)
└── .gitignore
```

**禁止的结构变种**:

| 错误 | 正确 |
| --- | --- |
| `src/` 包一层 | 根目录平铺 |
| `components/` 在根 | UI 原语在 `@openconsole/{atoms,shadcn}`;业务组件进 `features/<domain>/components/` |
| `pages/` | App Router,放 `app/` |
| `middleware.ts` | Next 16 改名 `proxy.ts` |
| `lib/api/` | 与 `app/api/` 冲突,改 `lib/request/` |
| `shared/` / `common/` | 用 `lib/` |
| `services/` | feature 内的服务端逻辑放 `features/<domain>/server/` |
| `hooks/` 在根 | feature 内的 hook 放 `features/<domain>/hooks/`;真正跨 feature 才进 `lib/` |
| `utils/` 在根 | 跨 feature 工具放 `lib/utils/` 或具体子目录;`cn()` 由 `@openconsole/shadcn` 提供 |

详细到每个文件夹的「能放 / 不能放」见 [`references/directory-structure.md`](./references/directory-structure.md)。

---

## 3. 配置文件(每一项有严格语义)

### 强制配置文件(scaffold 必生成,内容固定)

| 文件 | 作用 | 改了会怎样 |
| --- | --- | --- |
| `next.config.ts` | `output: "standalone"`(Docker)/`cacheComponents: true`(`'use cache'` 必需)/`reactCompiler: true`(自动 memo)/`cacheHandler`(Redis 共享缓存)/`transpilePackages`(消费 monorepo 包)/`serverExternalPackages: ["nacos"]`(避免打包)/`experimental.authInterrupts`(`unauthorized()`/`forbidden()` 必需)/`turbopackFileSystemCacheForDev`(Turbo 缓存) | 关任何一项都会破坏对应能力 |
| `tsconfig.json` | `"strict": true` + `"verbatimModuleSyntax": true` + `"moduleResolution": "bundler"` + `paths.@/*` | 关 strict / verbatim 不允许 |
| `postcss.config.mjs` | 唯一插件 `@tailwindcss/postcss` | 不加 autoprefixer(v4 已内置) |
| `pnpm-workspace.yaml` | `allowBuilds`(esbuild / sharp / unrs-resolver)+ `minimumReleaseAgeExclude: ["@openconsole/*"]` | 没有就装不上新发的内部包 |
| `env.ts` | `@t3-oss/env-nextjs` 双写 server + client,`emptyStringAsUndefined: true` | 新增 client 端变量必须双写到 `experimental__runtimeEnv` |
| `proxy.ts` | Next 16 middleware,实现 SSO 跳转 + trace-id 注入 | 不能改名(Next 16 约定),不能去掉 `matcher` |
| `instrumentation.ts` | 启动 Nacos + `onRequestError` 日志 | 必须 `if (NEXT_RUNTIME !== "nodejs") return` 守护 |
| `cache-handler.mjs` | 生产构建用 Redis 共享缓存,降级 LRU | dev 模式不会用到;不要在 dev 看不到生效就删了 |
| `drizzle.config.ts` | 从 `.env.local` 读 `DATABASE_URL`,migrations 到 `./drizzle` | `casing` 必须 `snake_case`(数据库列名约定) |

详见 [`references/configs.md`](./references/configs.md)。

### 业务可写的配置文件

| 文件 | 由业务自由扩展 |
| --- | --- |
| `config/site.ts` | name / description / defaultRedirect / 任何站点级常量 |
| `config/sidebar.ts` | brand + menu,**icon 必须是 PascalCase 字符串**(可序列化到 client) |
| `.env.local` | 业务自加;新增**必须**同步到 `env.ts` schema |

---

## 4. UI 严格约束 —— 白名单 + 黑名单

### ✅ 唯一允许的导入

```ts
// shadcn 原语 —— 按钮、表单、Dialog、Table、Card……
import { Button, Input, Dialog, /* … */ } from "@openconsole/shadcn";

// atoms 高阶组件 —— Header、Sidebar、ThemeProvider、Preferences、错误页……
import { Header, Sidebar, ThemeProvider, NotFound, /* … */ } from "@openconsole/atoms";

// 图标
import { LayoutDashboard, Settings } from "lucide-react";
```

### ❌ 永远禁止

```ts
// 直接装 shadcn-ui
pnpm add shadcn-ui                    // ❌
npx shadcn add button                  // ❌

// 拷贝 shadcn 源码到本地
components/ui/button.tsx               // ❌

// 直接 import radix(应通过 shadcn 中转)
import * as Dialog from "@radix-ui/react-dialog";   // ❌

// 其它 UI 库
import { Button } from "@mui/material";             // ❌
import { Button } from "antd";                      // ❌
import { Button } from "@chakra-ui/react";          // ❌

// 其它图标库
import { FaArrow } from "react-icons/fa";           // ❌
import { Icon } from "@iconify/react";              // ❌

// 自己写 className 组合工具
function cn(...classes) { return classes.join(" "); }   // ❌
// 用 @openconsole/shadcn 自带的 cn()                   // ✓
```

### 没有现成原语怎么办?

1. 先检查 `@openconsole/atoms` 是否已经覆盖了类似场景(`<Preferences>` / `<Header>` 之类的业务级)
2. 用 `@openconsole/shadcn` 的低层原语拼装,放在 `features/<domain>/components/`
3. 如果是真正可复用、跨项目的新原语,提 PR 加到 `@openconsole/atoms`(走 [`ui`](../ui/SKILL.md) skill 的流程)
4. **不要**在项目里建 `components/ui/` 偷偷拷贝

详见 [`references/ui-rules.md`](./references/ui-rules.md)。

---

## 5. 主题 / 布局 一致性

| 项 | 约定 | 在哪里 |
| --- | --- | --- |
| 品牌主色 | `oklch(0.7 0.12 183)` = `#17b3a3`(青绿色) | `@openconsole/shadcn/styles.css` 的 `--primary` |
| 字体 | Geist Sans / Geist Mono / Inter / Manrope 四套,通过 `next/font/google` 注入 CSS 变量 | `app/layout.tsx` |
| 默认字体 | Inter,`<html className="font-inter">` 配 head 内联脚本防闪烁 | `app/layout.tsx` |
| 明暗主题 | `next-themes` `attribute="class"`,默认跟随系统 | `<ThemeProvider>` from atoms |
| 侧边栏布局 | inset 变体、icon 折叠模式、left 侧;持久化到 cookie `openconsole-layout` | atoms `<LayoutProvider>` |
| 侧边栏展开 | 持久化到 cookie `sidebar_state`(shadcn 内置) | atoms `<SidebarProvider>` |
| 顶栏 | 粘性,左右两段;主题切换 + Preferences 按钮内置 | atoms `<Header>` |
| 错误页 | 五种状态码统一用 atoms 组件 | `app/{not-found,unauthorized,forbidden,error,global-error}.tsx` + `app/(errors)/*` |

**禁止**:

- 在项目里覆盖 `--primary` 改品牌色(要改去 `@openconsole/shadcn`)
- 自己写 `<ThemeProvider>` / `<SidebarProvider>` —— 用 atoms 的版本(它们是 async server component,做了防闪烁的 cookie 读取)
- 用 inline style 写颜色字面量(`style={{ color: "#17b3a3" }}`)—— 用 Tailwind 的 `text-primary` / `bg-primary` 或 CSS 变量 `var(--primary)`

详见 [`references/theme.md`](./references/theme.md)。

---

## 6. 登录跳转(SSO Flow)—— 全链路

```
浏览器
  │
  │  ① 访问任意路径 e.g. /dashboard
  ▼
proxy.ts(Next 16 middleware)
  │
  │  ② 没 token cookie?
  │       a. 拼 redirect_uri + source=sso 到 fragment
  │       b. 写 continue cookie 记录原路径(只对 document 请求)
  │       c. 302 跳 NEXT_PUBLIC_AUTH_URL/login#fragment
  │
  ▼
外部 SSO 登录页
  │
  │  ③ 登录成功 → 重定向回 NEXT_PUBLIC_APP_URL/#token=...&tenant_code=...
  ▼
浏览器(回到本站)
  │
  │  ④ 命中 app/page.tsx 渲染 <SsoCallback />
  ▼
SsoCallback (client component)
  │
  │  ⑤ 解析 location.hash → 调 features/auth/actions.ts 的 setSession(...)
  │
  ▼
setSession (server action, "use server")
  │
  │  ⑥ zod 校验 → cookies().set(token / tenant_code, httpOnly)
  │  ⑦ 读 continue cookie 得到原路径(默认 /dashboard)
  │  ⑧ return { next }
  │
  ▼
SsoCallback
  │
  │  ⑨ history.replaceState 清掉 URL 上的 hash
  │  ⑩ window.location.replace(next) —— 全页刷新,带上新 cookie
  ▼
受保护页面正常渲染
```

**所有项目必须共享这套实现**。能修改的只有:

- `siteConfig.defaultRedirect`:控制 ⑦ 没有 continue cookie 时的默认目的地
- `env.COOKIE_TOKEN` / `env.COOKIE_TENANT_CODE` / `env.COOKIE_CONTINUE`:cookie 名(默认 `token` / `tenant_code` / `continue`)

**禁止**:

- 自己实现 `getServerSession()` / `useSession()`
- 直接 `cookies().get("token")`(用 `getSession()` from `features/auth/server/session.ts`)
- 在 Server Action 里跳过 session 检查就操作用户数据
- 用 `router.replace(next)` 代替 `window.location.replace(next)`(刚写完 cookie 必须全页刷新)

详见 [`references/auth-flow.md`](./references/auth-flow.md)。

---

## 7. 数据层

### 三个层次

```
┌──────────────────────────────────────────────────────────────────┐
│  features/<domain>/_cached.ts          ← 'use cache' 读层         │
│    • cacheLife() + cacheTag()                                     │
│    • 不能调 cookies() / headers() / Date.now() / Math.random()   │
│    • 输入参数确定输出 —— deterministic                            │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ 包装
                              │
┌──────────────────────────────────────────────────────────────────┐
│  features/<domain>/actions.ts          ← 'use server' Server Action│
│    • zod parse 入参                                                │
│    • 业务逻辑(包括读 cookies / 鉴权)                              │
│    • 写操作完调 updateTag(...) 失效缓存                            │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ 调用
                              │
┌──────────────────────────────────────────────────────────────────┐
│  app/<route>/page.tsx (RSC) / 客户端组件                          │
│    • RSC 直接 await action                                         │
│    • Client 通过 TanStack Query 拿 initialData                     │
└──────────────────────────────────────────────────────────────────┘
```

### 模板的两套数据源样例

| 数据源 | 模板里的例子 | 路径 |
| --- | --- | --- |
| 自己的数据库(Drizzle + pgbouncer + Postgres) | `notes` 功能 | `lib/db/` + `features/notes/` |
| 外部 BFF(SSO + envelope `{code,data,msg}`) | 当前登录用户 `getMe()` | `lib/request/` + `features/auth/` |
| 其它内部服务(Nacos 服务发现) | — | `@openconsole/nacos` 的 `client().fetch("nacos://service/path")` |

### 协议:BFF 响应统一是 envelope

```ts
type ApiResponse<T> = { code: number; data: T; msg: string };
//  code === 0 → 成功
//  code !== 0 → 失败,抛 ApiError(code, msg)
```

调 BFF 用 `safeUnwrap(Schema, request("/path"))`(zod 校验 + envelope 拆解)。

### Redis 双用途

1. **`lib/redis/`**:应用层业务用(限流、临时状态、pub/sub)
2. **`cache-handler.mjs`**:Next.js cache backend(`'use cache'` 和 `revalidateTag` 跨实例共享)

详见 [`references/data-layer.md`](./references/data-layer.md)。

---

## 8. 错误页系统

Next 16 提供 5 个 special files + `unauthorized()` / `forbidden()` 函数。模板**全部**已经实现:

| 文件 | 触发 | 渲染 |
| --- | --- | --- |
| `app/not-found.tsx` | `notFound()` 或路由不存在 | atoms `<NotFound>` |
| `app/unauthorized.tsx` | `unauthorized()`(需 `experimental.authInterrupts`) | atoms `<Unauthorized>` |
| `app/forbidden.tsx` | `forbidden()`(同上) | atoms `<Forbidden>` |
| `app/error.tsx` | segment 内抛错(`"use client"`) | atoms `<ServerError>` + reset 按钮 |
| `app/global-error.tsx` | root layout 崩(`"use client"`,自渲 `<html>`) | 同上 |

另外 `app/(errors)/*` 路由组提供五个直接可访问的错误页(`/error` / `/forbidden` / `/maintenance` / `/not-found` / `/unauthorized`),方便运维 / 客服直接给链接。

**禁止**:

- 自己画 404 / 401 / 500 页面 —— 用 atoms 的现成组件
- 在 `error.tsx` 里去掉 `"use client"`
- 在 `global-error.tsx` 里去掉自渲 `<html>`(它替换了 root layout)

详见 [`references/error-pages.md`](./references/error-pages.md)。

---

## 9. 加新功能(feature slice)

每加一个新 domain 必须遵守这个目录契约:

```
features/<domain>/
├── schemas.ts              # zod schemas(单一事实来源)
├── types.ts                # 从 schemas 派生 + 其它 TS-only 类型(可选)
├── actions.ts              # "use server" —— 写操作 + 失效缓存
├── _cached.ts              # "use cache" —— 读操作(可选,但缓存必走这里)
├── components/             # client / RSC 组件
│   ├── <name>-form.tsx
│   ├── <name>-table.tsx
│   └── <name>-delete-dialog.tsx
├── queries/                # TanStack Query 选项 + key(给 client 用)
│   ├── keys.ts
│   └── options.ts
├── contexts/               # 该 feature 的 React Context(可选)
├── hooks/                  # 该 feature 的自定义 hook(可选)
└── server/                 # 仅服务端工具,**不是** Server Action(可选)
```

对应路由放在 `app/(dashboard)/<domain>/`:

```
app/(dashboard)/<domain>/
├── page.tsx              # 列表(RSC 里 await _cached.ts → 传给 client 组件 initialData)
├── [id]/page.tsx         # 详情
└── new/page.tsx          # 新建(可选;模板里走 dialog,不需要单独路由)
```

**禁止**:

- 在 `features/<domain>/index.ts` 里 re-export `actions.ts` —— `"use server"` directive 必须在 import 点可见
- 业务代码直接放 `app/<route>/`(那里只放路由和组合)
- 跨 feature 直接 import 别人的 `_cached.ts` —— 数据访问必须经 Server Action

详见 [`references/features.md`](./references/features.md)。

---

## 10. 命令清单

| 场景 | 命令 |
| --- | --- |
| 装包 | `pnpm install` |
| 起本地依赖(Postgres / Redis / Nacos) | `docker compose -f docker/docker-compose.yaml up -d` |
| 开发 | `pnpm dev` |
| 生产构建 | `pnpm build` |
| 启动生产服 | `pnpm start` |
| 数据库迁移 —— 生成 | `pnpm db:generate` |
| 数据库迁移 —— 应用 | `pnpm db:migrate` |
| 数据库迁移 —— 直推(dev) | `pnpm db:push` |
| Drizzle Studio | `pnpm db:studio` |
| 格式化 | `pnpm format` |
| 健康检查 | `curl http://localhost:3000/api/health` |

**禁止**:

- 用 `npm` / `yarn`(锁文件冲突)
- 用 `npx create-next-app`(目录约定冲突)
- 跳过 Docker 直连 `localhost:5432` 的 Postgres(必须经 pgbouncer 的 6432)

---

## 11. Agent 操作规则

进入项目时:

1. **第一步**:读取本文件 + SKILL.md
2. **第二步**:用 `Glob` 看根目录文件清单,对照「目录结构」段确认结构合法
3. **第三步**:对照「技术栈版本」检查 `package.json` 没有禁用依赖
4. **第四步**:再做用户要求的事

写新代码时:

1. 不知道该放哪 → 查 [`references/directory-structure.md`](./references/directory-structure.md)
2. 不知道该用什么组件 → 查 [`references/ui-rules.md`](./references/ui-rules.md)
3. 写 Server Action → 查 [`references/data-layer.md`](./references/data-layer.md)
4. 接登录 → 查 [`references/auth-flow.md`](./references/auth-flow.md)
5. 通用 Next.js 写法 → 查 [`nextjs-best-practices/SKILL.md`](../nextjs-best-practices/SKILL.md)

review 代码时:

按 SKILL.md 的「Code review 触发检查」清单逐项过,违反的指出来 + 引用本文件对应段落作为依据。

---

## 12. 外部参考

- 模板项目:`E:\opencode\oepntemplate`(权威实现)
- UI 包源码:`packages/atoms` / `packages/shadcn`
- Nacos 客户端:`packages/nacos`
- [Next.js 16 文档](https://nextjs.org/docs)
- [Cache Components](https://nextjs.org/docs/app/getting-started/caching-and-revalidating)
- [Drizzle ORM](https://orm.drizzle.team)
- [Tailwind v4](https://tailwindcss.com/docs)
- [TanStack Query v5](https://tanstack.com/query/latest)
