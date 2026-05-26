# AI Coding Standards

公司内部所有 Next.js 项目的**统一开发规范** —— 所有 AI agent 必须遵循。本文是
「宪法」,负责描述强约束;具体到怎么写代码、怎么搭骨架、怎么接登录、怎么用 UI
组件,分发到下面四个 skill。

| 场景 | Skill |
| --- | --- |
| 从零初始化 / 写 page / 写 Server Action / RSC 边界 / 数据层 / 错误页 / 加 feature | [`skill:nextjs-best-practices`](./nextjs-best-practices/SKILL.md) |
| 登录 / 鉴权 / 会话 / SSO 回调 | [`skill:nextjs-auth-callback`](./nextjs-auth-callback/SKILL.md) |
| UI 组件使用 / 主题 / 布局 / 防闪烁 / `@openconsole/{atoms,shadcn}` | [`skill:ui`](./ui/SKILL.md) |
| TanStack Query 客户端数据获取 | [`skill:tanstack-query`](./tanstack-query/SKILL.md) |
| 表单 + zod + shadcn Form | [`skill:react-hook-form`](./react-hook-form/SKILL.md) |
| Drizzle ORM —— schema / migrations / query patterns / `_cached.ts` | [`skill:drizzle-orm`](./drizzle-orm/SKILL.md) |
| Redis —— `lib/redis/` 应用层 + `cache-handler.mjs` cache backend + 数据结构选择 + RQE | [`skill:redis-development`](./redis-development/SKILL.md) |
| React 组合 / 性能 / 重渲优化 | [`skill:vercel-composition-patterns`](./vercel-composition-patterns/SKILL.md) |

权威实现参考:`E:\opencode\oepntemplate`(企业内部模板,任何分歧以这个仓库为准)。

---

## 0. 五条硬规则(最常违反)

> 90% 的违规都集中在这里。Agent 写 / review 代码前先把这五条过一遍。

1. **UI 库白名单**:只允许从 `@openconsole/atoms` 与 `@openconsole/shadcn` 导入组件,**禁止** `pnpm add shadcn-ui` / `npx shadcn add` / 拷贝 shadcn 源码到 `components/ui/`。详见 [`skill:ui`](./ui/rules/library-whitelist.md)。

2. **目录约定**:`app/` 只放路由,业务代码全部进 `features/<domain>/`。`lib/` 是基建(db / redis / query / request / logger)。**没有** `src/` / `shared/` / `components/`。详见 [`skill:nextjs-best-practices`](./nextjs-best-practices/references/directory-structure.md)。

3. **登录流向固定**:未带 token 访问受保护路由 → `proxy.ts` 重定向到外部 SSO → SSO 把 token 拼到 hash 回 `/` → `<SsoCallback />` 调 `setSession` server action 写 cookie → `window.location.replace(next)` 跳转。**禁止**自己写 `getServerSession` / 手动读 cookie / 自实现 token 校验。详见 [`skill:nextjs-auth-callback`](./nextjs-auth-callback/SKILL.md)。

4. **数据层用 Cache Components**:`'use cache'` + `cacheTag` 在 `features/<domain>/_cached.ts`,Server Action 在 `features/<domain>/actions.ts` 里调 `updateTag(...)` 失效。`'use cache'` 函数里**禁用** cookies / headers / Date.now() / Math.random()。详见 [`skill:nextjs-best-practices`](./nextjs-best-practices/references/data-layer.md)。

5. **主题色 `#17b3a3`(oklch teal)**:已经写进 `@openconsole/shadcn/styles.css`,**不要**在项目里二次覆盖 `--primary`。要换品牌色就修 `@openconsole/shadcn`(影响所有项目)或在自己项目 `globals.css` 里通过 `@theme inline` 覆盖,绝不能写散落的 `style="color: ..."`。详见 [`skill:ui`](./ui/rules/theme.md)。

---

## 1. 技术栈版本(强一致,禁止 drift)

| 类别 | 包 | 版本 | 备注 |
| --- | --- | --- | --- |
| 框架 | `next` | `16.2.6` | App Router + Cache Components 启用 |
| React | `react` / `react-dom` | `19.2.6` | Compiler 已启用 |
| 语言 | `typescript` | `^6.0.3` | `strict: true` + `verbatimModuleSyntax: true` |
| 样式 | `tailwindcss` | `^4.3.0` | v4 zero-config,入口 `globals.css` |
| PostCSS | `@tailwindcss/postcss` | `^4.3.0` | 唯一 PostCSS 插件 |
| UI 原语 | `@openconsole/shadcn` | `0.2.1+` | shadcn/ui 全集 + 主题 token |
| UI 业务级 | `@openconsole/atoms` | `0.2.1+` | Header / Sidebar / Preferences / Provider |
| Nacos 客户端 | `@openconsole/nacos` | `0.2.1+` | 零配置,读 `NACOS_*` env |
| 图标 | `lucide-react` | `^1.16.0` | 唯一图标库 |
| 主题切换 | `next-themes` | `^0.4.6` | 已被 atoms 的 `<ThemeProvider>` 包装 |
| Toast | `sonner` | `^2.0.7` | 通过 `@openconsole/shadcn` 的 `<Toaster>` 挂载 |
| 客户端缓存 | `@tanstack/react-query` | `^5.100.14` | **唯一**客户端缓存库,禁止 SWR |
| 表格 | `@tanstack/react-table` | `^8.21.3` | |
| URL 状态 | `nuqs` | `^2.8.9` | list / filter / pagination 必走 URL |
| 表单 | `react-hook-form` | `^7.76.0` | + `@hookform/resolvers@^5.2.2` |
| 校验 | `zod` | `^4.4.3` | 客户端 + Server Action 双校验 |
| HTTP | `ofetch` | `^1.5.1` | BFF 调用,封装在 `lib/request/` |
| ORM | `drizzle-orm` | `^0.45.2` | + `drizzle-kit@^0.31.10` |
| Postgres 客户端 | `postgres` | `^3.4.9` | 通过 pgbouncer 连接 |
| Redis 客户端 | `ioredis` | `^5.10.1` | 应用层使用 |
| Next cache backend | `@neshca/cache-handler` | `^1.9.0` | + `redis@^4.7.0`,生产专用 |
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
│   └── <domain>/
│       ├── actions.ts                  # "use server" —— Server Actions
│       ├── _cached.ts                  # "use cache" 包装的读 —— 不能读 cookies/headers
│       ├── schemas.ts                  # zod schemas(单一事实来源)
│       ├── types.ts                    # 从 schemas 派生的类型
│       ├── components/
│       ├── contexts/                   # 该 feature 的 React Context(可选)
│       ├── hooks/                      # 自定义 hooks(可选)
│       ├── queries/                    # TanStack Query 选项 + key
│       │   ├── keys.ts
│       │   └── options.ts
│       └── server/                     # 仅服务端工具(非 Server Action)
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
├── docker/                             # 本地开发依赖(pgbouncer + nacos)
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

所有新项目**必须**通过 [`skill:nextjs-best-practices/references/scaffold.md`](./nextjs-best-practices/references/scaffold.md) 生成统一骨架,**不得**使用 `npx create-next-app` 或其它方式。骨架包含:

- 66 个文件的完整代码蓝本
- 统一的 Provider 嵌套链(`ThemeProvider` / `FontProvider` / `NuqsAdapter` / `LayoutProvider` / `SidebarProvider`)
- 统一的 Dashboard layout(Sidebar + Header)
- 统一的错误页(5 个 special files + (errors) 路由组)
- 统一的本地依赖容器(pgbouncer + nacos)

详细的逐文件内容、配置语义、何时改、不准改什么 —— 见 [`skill:nextjs-best-practices`](./nextjs-best-practices/SKILL.md) 入口与 `references/`。

---

## 4. 主题 / 布局(防闪烁约束)

所有项目必须使用 `@openconsole/atoms` 提供的 Provider 管理主题、字体、布局:

- 根布局必须嵌套:`NuqsAdapter` > `ThemeProvider` > `FontProvider` > `QueryProvider` > `NextTopLoader` + `Toaster`
- Dashboard 布局必须嵌套:`LayoutProvider` > `SidebarProvider`(都从 **atoms** 引入,不是 shadcn) > `Sidebar` + `SidebarInset`
- `LayoutProvider` / `SidebarProvider` 是服务端组件,在服务端读 cookie 还原状态,首屏 HTML 即终态 → **没有闪烁**
- 图标**必须**使用 `lucide-react`:组件代码里 import 真组件;配置文件传 PascalCase 字符串

详见 [`skill:ui/rules/theme.md`](./ui/rules/theme.md) 与 [`skill:ui/rules/foundation.md`](./ui/rules/foundation.md)。

---

## 5. 登录 / 鉴权

所有项目共享同一套 SSO 鉴权机制:

- 状态读取:RSC / Server Action 用 `getSession()` from `@/features/auth/server/session`(基于 `React.cache` + `cookies()`)
- 未授权访问:`unauthorized()` from `next/navigation`,触发 `app/unauthorized.tsx`
- 守卫:Server Action 操作用户数据前必须检查 session
- 回调流程:`proxy.ts` → 外部 SSO → `/#token=...` → `<SsoCallback />` → `setSession` server action → `window.location.replace(next)`

**禁止**:`getServerSession` / 手动读 cookie / 自实现 token 校验。

详见 [`skill:nextjs-auth-callback`](./nextjs-auth-callback/SKILL.md)。

---

## 6. 数据获取

- **服务端读**:`features/<domain>/_cached.ts`(`'use cache'` + `cacheTag`)
- **服务端写**:`features/<domain>/actions.ts`(`'use server'`,调 `updateTag(...)` 失效)
- **客户端读**:TanStack Query,queryFn 调 Server Action,初始数据通过 `initialData` 喂入
- **BFF**:`lib/request/`(`ofetch` + envelope `{code,data,msg}` + `safeUnwrap`)
- **跨服务**:`@openconsole/nacos` 的 `client().fetch("nacos://service/path")`

**禁止**:SWR / axios / 自己拼 `Authorization: Bearer ${token}`(用 `getSessionHeaders()` 自动注入) / 在 `app/api/<entity>/route.ts` 写业务 CRUD(用 Server Action)。

详见 [`skill:nextjs-best-practices/references/data-layer.md`](./nextjs-best-practices/references/data-layer.md)。
具体到 ORM 写法见 [`skill:drizzle-orm`](./drizzle-orm/SKILL.md);Redis 数据结构 / 性能见 [`skill:redis-development`](./redis-development/SKILL.md)。

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
docker compose -f docker/docker-compose.yaml up -d         # 本地 Postgres + Redis + Nacos
pnpm db:push                                                # 数据库迁移(dev)
pnpm dev                                                    # 开发服(localhost:3000)
pnpm build                                                  # 生产构建
pnpm start                                                  # 启动生产
pnpm format                                                 # prettier
pnpm db:generate                                            # 生成迁移文件
pnpm db:migrate                                             # 应用迁移(prod)
pnpm db:studio                                              # Drizzle Studio
curl http://localhost:3000/api/health                       # 健康检查
```

**禁止**:

- 用 `npm` / `yarn`(锁文件冲突)
- 用 `npx create-next-app`(目录约定冲突)
- 跳过 Docker 直连 `localhost:5432`(必须经 pgbouncer 的 6432)

---

## 9. Agent 规则

1. 进入项目首先读取本文档
2. 严格遵循目录结构;偏离需在 PR 描述说明
3. 写 / review 代码时,按 SKILL.md 与对应 reference 文件交叉验证
4. 不知道该用什么 UI 组件 → [`skill:ui`](./ui/SKILL.md)
5. 不知道该把代码放哪 → [`skill:nextjs-best-practices/references/directory-structure.md`](./nextjs-best-practices/references/directory-structure.md)
6. 不知道怎么搭骨架 → [`skill:nextjs-best-practices/references/scaffold.md`](./nextjs-best-practices/references/scaffold.md)
7. 不知道怎么接登录 → [`skill:nextjs-auth-callback`](./nextjs-auth-callback/SKILL.md)
8. 不知道怎么写 Server Action / Cache Components → [`skill:nextjs-best-practices/references/data-layer.md`](./nextjs-best-practices/references/data-layer.md)
9. 不知道怎么加新 feature → [`skill:nextjs-best-practices/references/features.md`](./nextjs-best-practices/references/features.md)
10. 提交前 / Review 前 → [`skill:nextjs-best-practices/references/checklist.md`](./nextjs-best-practices/references/checklist.md)

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
