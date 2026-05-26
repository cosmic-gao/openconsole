# Scaffold —— 完整文件蓝图(索引)

> 从空目录到可运行的统一 Next.js 应用 —— 共 **66 个文件**,按目录拆到 `scaffold/` 子目录里,每个子文件包含该目录下所有文件的**完整内容**(直接 Write,除占位符外**一字不改**)。
>
> **Postgres / Redis / Nacos 都不在骨架内启动** —— 骨架不带 docker-compose。开始 scaffold 前先用 [`../SKILL.md`](../SKILL.md) Step 1 的问题问用户:
> - `<PROJECT_NAME>` —— 项目名(`package.json` / cache key 前缀)
> - `<PROJECT_DISPLAY_NAME>` —— 显示名(`config/site.ts` / sidebar brand)
> - `<DEFAULT_REDIRECT>` —— 登录后默认落地路径(默认 `/dashboard`)
> - `<DATABASE_URL>` —— 用户提供的 Postgres 连接串(可以直连 `:5432`,也可以是 pgbouncer transaction mode `:6432`)
> - `<REDIS_URL>` —— 用户提供的 Redis 连接串
> - `<NACOS_SERVER>` / `<NACOS_NAMESPACE>` / `<NACOS_USERNAME>` / `<NACOS_PASSWORD>` —— 用户的 Nacos 注册中心(可选,不接就把相关 env 留空,`instrumentation.ts` 启动时会跳过)
> - `<SERVICE_NAME>` —— Nacos 注册的服务名(常与 `<PROJECT_NAME>` 相同;不接 Nacos 时无关)

---

## 拆分后的目录结构

```
references/scaffold/
├── root.md             [1]-[12]   12 个根配置文件
├── app.md              [13]-[29]  app/ 路由 + special files + (errors) 组 + api/health
├── config.md           [30]-[31]  config/ 静态配置
├── lib.md              [32]-[43]  lib/ 跨 feature 基建(db / redis / query / request / logger)
├── features-auth.md    [44]-[52]  features/auth/ 鉴权切片(9 个文件,必装)
├── features-notes.md   [53]-[60]  features/notes/ 示范切片(8 个文件)
├── drizzle.md          [61]-[64]  contexts/.gitkeep + drizzle/* 迁移产物
└── public.md           [65]-[66]  favicon + loading.json
```

按推荐顺序写入:

| 顺序 | 文件 | 何时 | 备注 |
| --- | --- | --- | --- |
| 1 | [`scaffold/root.md`](./scaffold/root.md) | 最先 | 没这些其它一切都跑不起来 |
| 2 | [`scaffold/config.md`](./scaffold/config.md) | 紧接 | site / sidebar 常量被 app/ 与 features/ 引用 |
| 3 | [`scaffold/lib.md`](./scaffold/lib.md) | 紧接 | db / redis / query / request 单例 |
| 4 | [`scaffold/features-auth.md`](./scaffold/features-auth.md) | lib 之后 | `lib/request/client.ts` 依赖 `features/auth/server/session.ts` |
| 5 | [`scaffold/features-notes.md`](./scaffold/features-notes.md) | features-auth 之后 | 示范切片(可保留 / 重命名 / 删除) |
| 6 | [`scaffold/app.md`](./scaffold/app.md) | features 之后 | 路由层依赖 features 的 actions / components |
| 7 | [`scaffold/drizzle.md`](./scaffold/drizzle.md) | 应用层完成 | 迁移产物(也可由 `pnpm db:generate` 生成) |
| 8 | [`scaffold/public.md`](./scaffold/public.md) | 任何时候 | favicon / loading 动画 |

---

## 完整文件树

```
<project-root>/
├── .gitignore                                 [1]
├── .env.local                                 [2]
├── package.json                               [3]
├── pnpm-workspace.yaml                        [4]
├── tsconfig.json                              [5]
├── next.config.ts                             [6]
├── postcss.config.mjs                         [7]
├── env.ts                                     [8]
├── proxy.ts                                   [9]
├── instrumentation.ts                         [10]
├── cache-handler.mjs                          [11]
├── drizzle.config.ts                          [12]
│
├── app/
│   ├── globals.css                            [13]
│   ├── layout.tsx                             [14]
│   ├── page.tsx                               [15]
│   ├── loading.tsx                            [15b]
│   ├── error.tsx                              [16]
│   ├── global-error.tsx                       [17]
│   ├── not-found.tsx                          [18]
│   ├── unauthorized.tsx                       [19]
│   ├── forbidden.tsx                          [20]
│   ├── (dashboard)/
│   │   ├── layout.tsx                         [21]
│   │   ├── dashboard/page.tsx                 [22]
│   │   └── notes/page.tsx                     [23]
│   ├── (errors)/
│   │   ├── error/page.tsx                     [24]
│   │   ├── forbidden/page.tsx                 [25]
│   │   ├── maintenance/page.tsx               [26]
│   │   ├── not-found/page.tsx                 [27]
│   │   └── unauthorized/page.tsx              [28]
│   └── api/
│       └── health/route.ts                    [29]
│
├── config/
│   ├── site.ts                                [30]
│   └── sidebar.ts                             [31]
│
├── lib/
│   ├── logger.ts                              [32]
│   ├── db/
│   │   ├── index.ts                           [33]
│   │   └── schema/
│   │       ├── index.ts                       [34]
│   │       └── notes.ts                       [35]
│   ├── redis/
│   │   ├── client.ts                          [36]
│   │   └── index.ts                           [37]
│   ├── query/
│   │   ├── client.ts                          [38]
│   │   ├── provider.tsx                       [39]
│   │   └── index.ts                           [40]
│   └── request/
│       ├── client.ts                          [41]
│       ├── types.ts                           [42]
│       └── index.ts                           [43]
│
├── features/
│   ├── auth/
│   │   ├── actions.ts                         [44]
│   │   ├── schemas.ts                         [45]
│   │   ├── types.ts                           [46]
│   │   ├── components/
│   │   │   └── sso-callback.tsx               [47]
│   │   ├── contexts/
│   │   │   └── auth-context.tsx               [48]
│   │   ├── hooks/
│   │   │   └── use-auth.ts                    [49]
│   │   ├── queries/
│   │   │   ├── keys.ts                        [50]
│   │   │   └── options.ts                     [51]
│   │   └── server/
│   │       └── session.ts                     [52]
│   └── notes/
│       ├── actions.ts                         [53]
│       ├── _cached.ts                         [54]
│       ├── schemas.ts                         [55]
│       ├── components/
│       │   ├── notes-table.tsx                [56]
│       │   ├── note-form.tsx                  [57]
│       │   └── note-delete-dialog.tsx         [58]
│       └── queries/
│           ├── keys.ts                        [59]
│           └── options.ts                     [60]
│
├── contexts/
│   └── .gitkeep                               [61]
│
├── drizzle/
│   ├── 0000_initial.sql                       [62]
│   └── meta/
│       ├── _journal.json                      [63]
│       └── 0000_snapshot.json                 [64]
│
└── public/
    ├── favicon.png                            [65] (二进制,任意 32×32 png)
    └── loading.json                           [66] (可选 Lottie 动画 JSON)
```

> **不含 `docker/` 目录**。Postgres / Redis / Nacos 都是外部依赖,**由运维 / 平台提供**;骨架只通过 `.env.local` 接它们的连接串。

---

## 完成后验证

```bash
# 1. 装包
pnpm install

# 2. 确认 .env.local 已填好 DATABASE_URL / REDIS_URL / NACOS_*
cat .env.local

# 3. 数据库迁移(dev 直推,跳过迁移文件)
pnpm db:push

# 4. 开发服
pnpm dev
```

打开 `http://localhost:3000`,应自动重定向到 `NEXT_PUBLIC_AUTH_URL/login`(因为没 token)。登录回来后:

- `/dashboard` 显示欢迎页 + 三个 QuickLink
- `/notes` 显示 Notes CRUD 表
- `/api/health` 返回 `{status: "ok", ...}`
- 主题色:青绿 `#17b3a3`
- 侧边栏 brand:`<PROJECT_DISPLAY_NAME>`(若改了 config/sidebar.ts)

---

## 排障速查

| 症状 | 大概率原因 | 看哪 |
| --- | --- | --- |
| `Cannot find module '@openconsole/...'` | `next.config.ts` 漏 `transpilePackages` | [`./configs.md`](./configs.md) |
| `Cookies/Headers must be awaited` | 用了 `cookies()` / `headers()` 没 `await` | Next 16 强制 async |
| `unauthorized is not a function` | `experimental.authInterrupts` 没开 | `next.config.ts` |
| Postgres 连接超时 / 拒绝 | `.env.local` 的 `DATABASE_URL` 错;Postgres 没启 | 查 `psql $DATABASE_URL` 直连 |
| Redis 连接错 | `.env.local` 的 `REDIS_URL` 错 | 查 `redis-cli -u $REDIS_URL ping` |
| Nacos 注册不上 | `NACOS_SERVER` 错 / 网络;或不需要 Nacos 时却开了 `NACOS_PROVIDER_ENABLED=true` | 把 `NACOS_PROVIDER_ENABLED=false` 关掉,或修 `NACOS_SERVER` |
| TanStack Query 报 dehydration error | Cache Components + `'use server'` queryFn + `HydrationBoundary` 不稳定 | 骨架用 `initialData`,不用 `HydrationBoundary` |
| `Module not found: server-only` | 客户端组件 import 了 server-only 模块 | 检查 import 链 |
| `'use cache' cannot use cookies()` | `_cached.ts` 里读 cookies | 把鉴权挪到 `actions.ts` |
| Drizzle 报 prepared statement 相关错 | 你的 Postgres 在 pgbouncer transaction mode 下,而 `prepare: false` 配置丢了 | 看 `lib/db/index.ts` 是否含 `prepare: false` |

更细的排障清单见 [`./checklist.md`](./checklist.md)。
