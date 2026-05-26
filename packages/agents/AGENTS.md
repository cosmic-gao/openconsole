# AI Coding Standards

公司内部所有 Next.js 项目的**统一开发规范** —— 所有 AI agent 必须遵循。本目录就是「项目宪法」与「模板蓝本」:AI 通过这套 skill 应当能**完整搭出一个统一的 Next.js 应用骨架**(空目录 → 可运行),并在其上做后续业务开发。**本目录不依赖任何外部参考仓库** —— 所有结构、配置、代码片段都在 skill 内部完整给出。

## 七个 skill —— 按用户意图路由

| 用户在做什么 | 触发哪个 skill |
| --- | --- |
| 从零初始化项目 / 写 page / 写 Server Action / RSC 边界 / 错误页 / 加 feature 切片 / nuqs / 性能 / RSC 优化 / metadata / 字体 / hydration / async params | [`skill:nextjs-best-practices`](./nextjs-best-practices/SKILL.md) |
| 接外部登录回调 / `proxy.ts` 重定向 / `SsoCallback` / `setSession` / `getSession` / 鉴权守卫 / continue cookie / 登录跳转 / RBAC / logout | [`skill:nextjs-auth-callback`](./nextjs-auth-callback/SKILL.md) |
| 用 `@openconsole/shadcn` / `@openconsole/atoms` / 主题切换 / Sidebar / Header / Breadcrumbs / Preferences / 表单组件 / 图标 / 防闪烁 / 布局 / 错误页 UI | [`skill:ui`](./ui/SKILL.md) |
| TanStack Query —— queryKey 工厂 / queryOptions / `useSuspenseQuery` / `useMutation` / `initialData` / 乐观更新 / Server Action 当 queryFn | [`skill:tanstack-query`](./tanstack-query/SKILL.md) |
| 表单 —— `react-hook-form` + `zod` + shadcn `<Form>` / `useForm` / `zodResolver` / 多步表单 / Sheet / Dialog form / 提交 + `useMutation` | [`skill:react-hook-form`](./react-hook-form/SKILL.md) |
| 数据库 —— Drizzle ORM / `postgres-js` / 加表 / 迁移 / `db.query.*` / `_cached.ts` / `updateTag` 失效 / pgbouncer / DATABASE_CASING | [`skill:drizzle-orm`](./drizzle-orm/SKILL.md) |
| Redis —— `lib/redis/` 应用层(rate limit / pub-sub / 临时状态) / `cache-handler.mjs` Next 共享缓存后端 / ioredis 单例 / TTL / Hash / 事务 | [`skill:redis-development`](./redis-development/SKILL.md) |

> 元 skill:[`skill:skill-creator`](./skill-creator/SKILL.md) —— 当用户希望**新增 / 修改 / 评估**本目录下的 skill 本身时使用。

---

## 0. 五条硬规则(90% 违规都集中在这里)

> Agent 在写 / review 代码前,先把这五条过一遍。

1. **UI 库白名单**:只允许从 `@openconsole/atoms` 与 `@openconsole/shadcn` 导入组件,**禁止** `pnpm add shadcn-ui` / `npx shadcn add` / 拷贝 shadcn 源码到 `components/ui/`。详见 [`skill:ui`](./ui/rules/library-whitelist.md)。

2. **目录约定**:`app/` 只放路由,业务代码全部进 `features/<domain>/`,基建在 `lib/`。**没有** `src/` / `shared/` / `components/` / `services/` / `pages/`。详见 [`skill:nextjs-best-practices`](./nextjs-best-practices/references/directory-structure.md)。

3. **登录流向固定**:未带 token 访问受保护路由 → `proxy.ts` 重定向到外部登录页 → 登录页把 token 拼到 hash 回 `/` → `<SsoCallback />` 调 `setSession` server action 写 cookie → `window.location.replace(next)` 跳转。**禁止**自己写 `getServerSession` / 手动读 cookie / 自实现 token 校验。详见 [`skill:nextjs-auth-callback`](./nextjs-auth-callback/SKILL.md)。

4. **数据层用 Cache Components**:`'use cache'` + `cacheTag` 在 `features/<domain>/_cached.ts`,Server Action 在 `features/<domain>/actions.ts` 里调 `updateTag(...)` 失效。`'use cache'` 函数里**禁用** cookies / headers / Date.now() / Math.random()。详见 [`skill:nextjs-best-practices`](./nextjs-best-practices/references/data-layer.md) + [`skill:drizzle-orm`](./drizzle-orm/SKILL.md)。

5. **主题色 `#17b3a3`(oklch teal)**:已经写进 `@openconsole/shadcn/styles.css`,**不要**在项目里二次覆盖 `--primary`。要换品牌色就修 `@openconsole/shadcn`(影响所有项目)或在自己项目 `globals.css` 里通过 `@theme inline` 覆盖,绝不能写散落的 `style="color: ..."`。详见 [`skill:ui`](./ui/rules/theme.md)。

---

## 1. 技术栈版本(强一致,禁止 drift)

| 类别 | 包 | 版本 | 备注 |
| --- | --- | --- | --- |
| 框架 | `next` | `16.2.6` | App Router + `cacheComponents: true` + `reactCompiler: true` |
| React | `react` / `react-dom` | `19.2.6` | Compiler 已启用 |
| 语言 | `typescript` | `^6.0.3` | `strict: true` + `verbatimModuleSyntax: true` |
| 样式 | `tailwindcss` | `^4.3.0` | v4 zero-config,入口 `app/globals.css` |
| PostCSS | `@tailwindcss/postcss` | `^4.3.0` | 唯一 PostCSS 插件 |
| UI 原语 | `@openconsole/shadcn` | `latest` | shadcn/ui 全集 + 主题 token。scaffold 与所有依赖说明都按 latest 走,不固定具体 minor 版本 |
| UI 业务级 | `@openconsole/atoms` | `latest` | Header / Sidebar / Preferences / Provider / 错误页 |
| Nacos 客户端 | `@openconsole/nacos` | `latest` | 零配置,读 `NACOS_*` env;`server-only` 守护 + Cache Components 友好(`markDynamic` 在 `Http.fetch` / `Discovery.list` 入口标记 dynamic) |
| 图标 | `lucide-react` | `^1.16.0` | 唯一图标库 |
| 主题切换 | `next-themes` | `^0.4.6` | 已被 atoms 的 `<ThemeProvider>` 包装 |
| Toast | `sonner` | `^2.0.7` | 通过 `@openconsole/shadcn` 的 `<Toaster>` 挂载 |
| 客户端缓存 | `@tanstack/react-query` | `^5.100.14` | **唯一**客户端缓存库,禁止 SWR |
| 表格 | `@tanstack/react-table` | `^8.21.3` | |
| URL 状态 | `nuqs` | `^2.8.9` | list / filter / pagination 必走 URL |
| 表单 | `react-hook-form` | `^7.76.0` | + `@hookform/resolvers@^5.2.2` |
| 校验 | `zod` | `^4.4.3` | 客户端 + Server Action 双校验 |
| HTTP | `ofetch` | `^1.5.1` | BFF 调用,封装在 `lib/request/` |
| ORM | `drizzle-orm` | `^0.45.2` | + `drizzle-kit@^0.31.10`,驱动选 `drizzle-orm/postgres-js` |
| Postgres 客户端 | `postgres` | `^3.4.9` | 通过 pgbouncer transaction mode 连接(6432) |
| Redis 客户端(应用层) | `ioredis` | `^5.10.1` | `lib/redis/` 单例 |
| Redis 客户端(cache backend) | `redis` | `^4.7.0` | 仅由 `@neshca/cache-handler` 使用,不要在业务代码里 import |
| Next cache backend | `@neshca/cache-handler` | `^1.9.0` | 生产专用,dev 自动 fallback 到 LRU |
| 进度条 | `nextjs-toploader` | `^3.9.17` | 顶部进度条 |
| Env 校验 | `@t3-oss/env-nextjs` | `^0.13.11` | `env.ts` 唯一入口 |
| Server 守护 | `server-only` | `^0.0.1` | 标记仅服务端文件 |
| 日期 | `date-fns` | `^4.2.1` | 唯一日期库 |
| 日历 | `react-day-picker` | `^9.14.0` | + atoms `<Calendar>` |
| 日志 | `consola` | `^3.4.2` | `lib/logger.ts` 唯一入口 |
| Drawer | `vaul` | `^1.1.2` | shadcn Drawer 依赖 |
| 包管理器 | `pnpm` | — | engines 强制,Node ≥ 22.11 |

**禁止新增**:

- 其它 UI 库(MUI / Antd / Chakra / Mantine 等)
- 其它客户端缓存(SWR / Apollo Client 等)
- 其它表单库(Formik / Final Form 等)
- 其它日期库(moment / dayjs)
- 其它 HTTP 客户端(axios)—— 用 `ofetch`
- 其它 ORM(Prisma / TypeORM)
- 其它 Postgres 驱动(`pg` / `node-postgres`)—— 用 `postgres`(driver-name `postgres-js`)

要新增依赖前先在 PR 描述里说明为什么现有依赖不够。

---

## 2. 目录结构(严格约定)

```
<project-root>/
├── app/                                # App Router —— 只放路由 + special files
│   ├── layout.tsx                      # 根布局:html / body / 全局 Provider 链
│   ├── globals.css                     # Tailwind v4 入口 + 业务字体变量
│   ├── page.tsx                        # `/` —— <SsoCallback /> 接收 token fragment
│   ├── error.tsx                       # segment-level error boundary
│   ├── global-error.tsx                # root error boundary(渲染自己的 <html>)
│   ├── not-found.tsx                   # `notFound()` 触发
│   ├── unauthorized.tsx                # `unauthorized()` 触发(Next 16)
│   ├── forbidden.tsx                   # `forbidden()` 触发(Next 16)
│   ├── (dashboard)/                    # 路由组 —— 共享 Dashboard 骨架
│   │   ├── layout.tsx                  # AuthProvider + LayoutProvider + SidebarProvider + Sidebar + Header
│   │   ├── dashboard/page.tsx
│   │   └── <feature>/page.tsx          # 每个 feature 一条路由
│   ├── (errors)/                       # 路由组 —— 直接可访问的错误页
│   │   ├── error/page.tsx
│   │   ├── forbidden/page.tsx
│   │   ├── maintenance/page.tsx
│   │   ├── not-found/page.tsx
│   │   └── unauthorized/page.tsx
│   └── api/
│       └── health/route.ts             # k8s liveness/readiness probe
│
├── features/                           # 业务领域切片 —— 业务代码全部在这
│   ├── auth/                           # 鉴权(模板预置)
│   │   ├── actions.ts                  # setSession Server Action + getMe
│   │   ├── schemas.ts                  # Credentials / User zod schemas
│   │   ├── types.ts
│   │   ├── components/sso-callback.tsx
│   │   ├── contexts/auth-context.tsx   # <AuthProvider> + useQuery(getMe)
│   │   ├── hooks/use-auth.ts
│   │   ├── queries/{keys,options}.ts
│   │   └── server/session.ts           # getSession() + getSessionHeaders()
│   └── <domain>/                       # 业务 feature
│       ├── actions.ts                  # "use server" —— Server Actions
│       ├── _cached.ts                  # "use cache" 包装的读
│       ├── schemas.ts                  # zod schemas
│       ├── types.ts
│       ├── components/
│       ├── contexts/                   # 可选
│       ├── hooks/                      # 可选
│       ├── queries/{keys,options}.ts
│       └── server/                     # 可选,仅服务端工具
│
├── lib/                                # 基建 —— 跨 feature 复用
│   ├── db/                             # Drizzle 客户端 + schema
│   ├── redis/                          # ioredis 单例(应用层用)
│   ├── query/                          # TanStack QueryClient + Provider
│   ├── request/                        # BFF ofetch 客户端 + envelope 协议
│   └── logger.ts                       # consola 日志单例
│
├── config/                             # 静态配置(纯数据,无副作用)
│   ├── site.ts                         # name / description / defaultRedirect
│   └── sidebar.ts                      # 侧边栏菜单数据(icon 是字符串)
│
├── contexts/                           # 跨 feature 全局 Context(默认空)
├── drizzle/                            # drizzle-kit 生成的迁移
├── public/                             # 静态资源
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json                       # paths: { "@/*": "./*" }
├── next.config.ts                      # standalone / cacheComponents / reactCompiler / cacheHandler / transpilePackages
├── postcss.config.mjs
├── env.ts                              # @t3-oss/env-nextjs 校验
├── proxy.ts                            # Next 16 middleware(改名为 proxy.ts)
├── instrumentation.ts                  # Nacos init + onRequestError 日志
├── cache-handler.mjs                   # @neshca/cache-handler + Redis 共享缓存
└── drizzle.config.ts
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
| `hooks/` 在根 | feature 内的 hook 放 `features/<domain>/hooks/` |
| `utils/` 在根 | 跨 feature 工具放 `lib/utils/`;`cn()` 由 `@openconsole/shadcn` 提供 |

详细规则:[`skill:nextjs-best-practices/references/directory-structure.md`](./nextjs-best-practices/references/directory-structure.md)。

---

## 3. 项目初始化(空目录搭骨架)

所有新项目**必须**通过 [`skill:nextjs-best-practices/references/scaffold.md`](./nextjs-best-practices/references/scaffold.md) 生成统一骨架,**不得**使用 `npx create-next-app` 或其它方式。scaffold 内含 66 个文件的完整代码蓝本(参数化的 `<PROJECT_NAME>` 由用户在 SKILL.md Step 1 填入),包括:

- 统一的 Provider 嵌套链(`NuqsAdapter` → `ThemeProvider` → `FontProvider` → `QueryProvider`)
- 统一的 Dashboard layout(`AuthProvider` → `LayoutProvider` → `SidebarProvider` → `Sidebar` + `Header`)
- 统一的错误页(5 个 special files + (errors) 路由组)
- 一份示范 feature(`features/notes`)展示 Cache Components + Drizzle + TanStack Query + react-hook-form 完整闭环
- Postgres / Redis / Nacos 由用户在 Step 2 提供连接串,**不**预置 docker-compose

详细的逐文件内容、配置语义、何时改、不准改什么 —— 见 [`skill:nextjs-best-practices`](./nextjs-best-practices/SKILL.md) 入口与 `references/`。

---

## 4. 主题 / 布局(防闪烁约束)

所有项目必须使用 `@openconsole/atoms` 提供的 Provider 管理主题、字体、布局:

- 根布局必须嵌套:`NuqsAdapter` > `ThemeProvider` > `FontProvider` > `QueryProvider` > `NextTopLoader` + `Toaster`
- Dashboard 布局必须嵌套:`AuthProvider` > `LayoutProvider` > `SidebarProvider`(都从 **atoms** 引入,不是 shadcn) > `Sidebar` + `SidebarInset`
- `LayoutProvider` / `SidebarProvider` 是服务端组件,在服务端读 cookie 还原状态,首屏 HTML 即终态 → **没有闪烁**
- 图标**必须**使用 `lucide-react`:组件代码里 import 真组件;配置文件传 PascalCase 字符串

详见 [`skill:ui/rules/theme.md`](./ui/rules/theme.md) 与 [`skill:ui/rules/foundation.md`](./ui/rules/foundation.md)。

---

## 5. 登录 / 鉴权

所有项目共享同一套外部登录回调机制:

- 状态读取:RSC / Server Action 用 `getSession()` from `@/features/auth/server/session`(基于 `React.cache` + `cookies()`)
- 未授权访问:`unauthorized()` from `next/navigation`,触发 `app/unauthorized.tsx`
- 守卫:Server Action 操作用户数据前必须检查 session
- 回调流程:`proxy.ts` → 外部登录页 → `/#token=...&tenant_code=...` → `<SsoCallback />` → `setSession` server action → `window.location.replace(next)`

**禁止**:`getServerSession` / 手动读 cookie / 自实现 token 校验。

详见 [`skill:nextjs-auth-callback`](./nextjs-auth-callback/SKILL.md)。

---

## 6. 数据获取

- **服务端读**:`features/<domain>/_cached.ts`(`'use cache'` + `cacheTag`)
- **服务端写**:`features/<domain>/actions.ts`(`'use server'`,调 `updateTag(...)` 失效)
- **客户端读**:TanStack Query,queryFn 调 Server Action,初始数据通过 `initialData` 喂入
- **客户端写**:`useMutation`,mutationFn 调 Server Action,`onSuccess` 用 `setQueryData` 直接更新 cache
- **数据库**:`lib/db/` Drizzle + Postgres-js,通过 pgbouncer 6432
- **应用层 Redis**:`lib/redis/` ioredis 单例(rate limiting / pub-sub / 临时状态)
- **BFF**:`lib/request/`(`ofetch` + envelope `{code,data,msg}` + `safeUnwrap`)
- **跨服务**:`@openconsole/nacos` 的 `client().fetch("nacos://service/path")`

**禁止**:SWR / axios / 自己拼 `Authorization: Bearer ${token}`(用 `getSessionHeaders()` 自动注入) / 在 `app/api/<entity>/route.ts` 写业务 CRUD(用 Server Action)。

详见:
- [`skill:nextjs-best-practices/references/data-layer.md`](./nextjs-best-practices/references/data-layer.md) —— 数据层全景
- [`skill:tanstack-query`](./tanstack-query/SKILL.md) —— 客户端缓存
- [`skill:react-hook-form`](./react-hook-form/SKILL.md) —— 表单
- [`skill:drizzle-orm`](./drizzle-orm/SKILL.md) —— ORM
- [`skill:redis-development`](./redis-development/SKILL.md) —— Redis

---

## 7. 环境变量

**禁止**直接读取 `process.env.NEXT_PUBLIC_*`。永远用 `@/env` 的 `env` 对象。

新增变量必须在 `env.ts` 双写:

```ts
// Server 端
server: { MY_VAR: z.string().min(1) }

// Client 端(必须 NEXT_PUBLIC_ 前缀)
client: { NEXT_PUBLIC_MY_VAR: z.string().min(1) }
experimental__runtimeEnv: {
  NEXT_PUBLIC_MY_VAR: process.env.NEXT_PUBLIC_MY_VAR,  // 必须映射
}
```

Nacos 相关 env(`NACOS_*`)是例外:`@openconsole/nacos` 直接读 `process.env`,不需要写进 `env.ts`。

详见 [`skill:nextjs-best-practices/references/configs.md`](./nextjs-best-practices/references/configs.md)。

---

## 8. 命令

```bash
pnpm install                                                # 装包
pnpm db:push                                                # 数据库迁移(dev 直推,要求 DATABASE_URL 已配)
pnpm dev                                                    # 开发服(localhost:3000)
pnpm build                                                  # 生产构建
pnpm start                                                  # 启动生产
pnpm format                                                 # prettier
pnpm db:generate                                            # 生成迁移文件
pnpm db:migrate                                             # 应用迁移(prod)
pnpm db:studio                                              # Drizzle Studio
curl http://localhost:3000/api/health                       # 健康检查
```

> Postgres / Redis / Nacos **不在骨架内**。Scaffold 流程的 Step 2 会问用户拿连接串。本地开发若需要起 Postgres / Redis,自己 `docker run` 或装本机服务,跟骨架解耦。

**禁止**:

- 用 `npm` / `yarn`(锁文件冲突)
- 用 `npx create-next-app`(目录约定冲突)
- 在骨架里加 `docker/docker-compose.yaml` —— 外部依赖由运维 / 平台提供

---

## 9. Agent 路由速查

1. 进入项目首先读取本文档
2. 严格遵循目录结构;偏离需在 PR 描述说明
3. 写 / review 代码时,按 SKILL.md 与对应 reference 文件交叉验证
4. 不知道该用什么 UI 组件 → [`skill:ui`](./ui/SKILL.md)
5. 不知道该把代码放哪 → [`skill:nextjs-best-practices/references/directory-structure.md`](./nextjs-best-practices/references/directory-structure.md)
6. 不知道怎么搭骨架 → [`skill:nextjs-best-practices/references/scaffold.md`](./nextjs-best-practices/references/scaffold.md)
7. 不知道怎么接登录 → [`skill:nextjs-auth-callback`](./nextjs-auth-callback/SKILL.md)
8. 不知道怎么写 Server Action / Cache Components → [`skill:nextjs-best-practices/references/data-layer.md`](./nextjs-best-practices/references/data-layer.md)
9. 不知道怎么加新 feature → [`skill:nextjs-best-practices/references/features.md`](./nextjs-best-practices/references/features.md)
10. 不知道怎么用 TanStack Query → [`skill:tanstack-query`](./tanstack-query/SKILL.md)
11. 不知道怎么写表单 → [`skill:react-hook-form`](./react-hook-form/SKILL.md)
12. 不知道怎么写 ORM / 加表 / 查询 → [`skill:drizzle-orm`](./drizzle-orm/SKILL.md)
13. 不知道怎么用 Redis(应用层 or cache backend) → [`skill:redis-development`](./redis-development/SKILL.md)
14. 提交前 / Review 前 → [`skill:nextjs-best-practices/references/checklist.md`](./nextjs-best-practices/references/checklist.md)

---

## 10. 外部参考

- [Next.js 16 文档](https://nextjs.org/docs)
- [Cache Components](https://nextjs.org/docs/app/getting-started/caching-and-revalidating)
- [Drizzle ORM](https://orm.drizzle.team)
- [Tailwind v4](https://tailwindcss.com/docs)
- [TanStack Query v5](https://tanstack.com/query/latest)
- [ofetch](https://github.com/unjs/ofetch)
- [nuqs](https://nuqs.dev/)
- [react-hook-form + zod](https://react-hook-form.com/get-started#SchemaValidation)
- [ioredis](https://github.com/redis/ioredis)
- [@neshca/cache-handler](https://caching-tools.github.io/next-shared-cache/)
