# Checklist —— 提交前 / Review 自检

> 每次完成一段工作,先按本文过一遍。Review 时也按本文做依据。

---

## 写代码 ↔ 文档对照表

| 写的东西 | 必查 |
| --- | --- |
| 加新路由 / page | [`directory-structure.md`](./directory-structure.md) `app/` 段 |
| 加新 feature 切片 | [`features.md`](./features.md) |
| 加新 Server Action / `'use cache'` | [`data-layer.md`](./data-layer.md) |
| 加新数据库表 | [`data-layer.md`](./data-layer.md) Drizzle 段 |
| 调外部 BFF / 拼请求 | [`data-layer.md`](./data-layer.md) envelope 段 |
| 鉴权 / 跳转 | [`../../nextjs-auth-callback/references/auth-flow.md`](../../nextjs-auth-callback/references/auth-flow.md) |
| 加错误页 / 自定义 404/401/403/500 | [`error-pages.md`](./error-pages.md) |
| 改 sidebar 菜单 | [`configs.md`](./configs.md) sidebar.ts 段 |
| 改主题色 / 字体 | [`../../ui/rules/theme.md`](../../ui/rules/theme.md) |
| 加 UI 组件 | [`../../ui/rules/library-whitelist.md`](../../ui/rules/library-whitelist.md) |
| 加 env 变量 | [`configs.md`](./configs.md) env.ts 段 |

---

## Pre-commit Checklist

### 通用

- [ ] `pnpm format` 通过(prettier 写过)
- [ ] 没有 `console.log` —— 服务端用 `scoped(tag)` 的 consola,客户端 debug 用 React Devtools / browser console 临时,提交前清掉
- [ ] 没有 `// TODO` 留在生产代码里(开 issue 跟踪)
- [ ] 新加的依赖在 `package.json` 的 dependencies 里出现了,**不**在 devDependencies(除非真的只是构建期用)

### 目录结构

- [ ] 没有新建 `src/` / `components/` / `hooks/` / `utils/` / `services/` / `shared/` / `middleware.ts` / `lib/api/`
- [ ] 业务代码全在 `features/<domain>/`,**不**在 `app/<route>/`
- [ ] `features/<domain>/index.ts` 没 re-export `actions.ts`(可以 re-export 类型 / schema)

### UI

- [ ] 所有 UI 组件来自 `@openconsole/atoms` / `@openconsole/shadcn` / `lucide-react`
- [ ] 没有从 `@radix-ui/*` / `shadcn-ui` / `@mui/*` / `antd` / `@chakra-ui/*` 直接 import
- [ ] 没有 `components/ui/` 目录
- [ ] 颜色用 semantic token(`bg-primary` / `text-foreground`),不用 hex(`#17b3a3`)
- [ ] 用 `cn()` 合并 className,不自己拼字符串
- [ ] icon 在配置数据里用字符串(`"LayoutDashboard"`),组件代码里真 import

### Server / Data

- [ ] Server Action 文件首行 `"use server"`
- [ ] `'use cache'` 函数没读 cookies/headers/Date.now/Math.random
- [ ] 写操作(create / update / delete)在 action 里调了 `updateTag(...)`
- [ ] 入参 zod 校验:`Schema.parse(input)`
- [ ] 鉴权:Server Action 操作用户数据前 `getSession() / unauthorized()`
- [ ] 调外部 BFF 用 `safeUnwrap(Schema, request("/path"))`,不裸 `ofetch` / `fetch`
- [ ] 调其它内部服务用 `client().fetch("nacos://service/path")`,不硬编码 IP

### Auth

- [ ] 没自己实现 `getServerSession()` / `cookies().get("token")`
- [ ] 没自己拼 `Authorization: Bearer ${token}` —— 用 `getSessionHeaders()` 自动注入
- [ ] callback 流程:`window.location.replace(next)`,不用 `router.replace`
- [ ] open-redirect 防护:`resolve()` 校验 continue cookie

### Forms

- [ ] form 用 `react-hook-form + zod + @openconsole/shadcn` 的 `<Form>`
- [ ] schema **两端校验**:client `useForm({ resolver: zodResolver(Schema) })` + server `Schema.parse(input)`

### URL State

- [ ] table / list / filter / pagination 用 `nuqs` 走 URL,不用 `useState`
- [ ] 服务端读 query 用 `createSearchParamsCache`

### Errors

- [ ] 错误页用 atoms 的 `<NotFound>` / `<Unauthorized>` / `<Forbidden>` / `<ServerError>` / `<Maintenance>`
- [ ] `app/error.tsx` 和 `app/global-error.tsx` 首行 `"use client"`
- [ ] `app/global-error.tsx` 自渲 `<html>` / `<body>`

### Performance

- [ ] 不在组件里定义内嵌组件
- [ ] 派生状态在 render 里直接算,不 `useState + useEffect` 凑
- [ ] 多个独立 await 用 `Promise.all` 并行
- [ ] 慢内容用 `<Suspense fallback={...}>` 包,不阻塞快内容
- [ ] `useSearchParams` 被 `<Suspense>` 包

### Env

- [ ] 新 env 变量在 `env.ts` 双写(schema + 如果是 client 端,还要 runtimeEnv 映射)
- [ ] 客户端用 `env.X`,**不**直接 `process.env.X`(除了 `process.env.NODE_ENV` 这种特殊场景)

### TypeScript

- [ ] `pnpm next build` 通过(或 `pnpm tsc --noEmit`)
- [ ] 没有 `any` —— 用 `unknown` + 类型守卫 / zod parse
- [ ] `import type` / `export type` 区分(`verbatimModuleSyntax` 要求)

### Images

- [ ] 用 `next/image`,不裸 `<img>`
- [ ] 新外部域名加进 `next.config.ts` 的 `images.remotePatterns`

---

## Code Review 触发检查(对每个 PR 都过)

### 第一眼

- [ ] 改动里没有 `components/ui/` 目录
- [ ] 没装新的 UI 库 / 图标库 / form 库 / cache 库
- [ ] 改动里没出现 `middleware.ts`(应该是 `proxy.ts`)
- [ ] 改动里没出现 `getServerSession` / `useSession` / `next-auth`(用模板自带的)

### 文件层级

- [ ] `app/<route>/` 是否只放路由(layout / page),业务逻辑在 `features/`
- [ ] `lib/` 加的子目录是不是真跨 feature 复用(否则该放 feature 内)
- [ ] `config/` 文件是不是纯数据 + 纯类型(没副作用)
- [ ] `features/<domain>/` 目录契约满足(schemas / actions / components / queries)

### Server Action

- [ ] 首行 `"use server"`
- [ ] 入参 `Schema.parse(input)`
- [ ] 鉴权(如果操作用户数据)
- [ ] 写操作末尾 `updateTag(...)`
- [ ] 返回值 JSON 可序列化(没函数、没 `Date`、没 `class instance`)

### `'use cache'`

- [ ] 首行 `"use cache"`
- [ ] 没读 cookies / headers / Date.now / Math.random
- [ ] 有 `cacheLife()` 和 `cacheTag()`
- [ ] tag 命名规范:`<entity>:list[:scope]` / `<entity>:item:<id>`

### 客户端组件

- [ ] 首行 `"use client"`(如果用 hook / 事件 / 浏览器 API)
- [ ] 没 `async function` 导出(client 不能 async)
- [ ] hooks 在顶层调,不在条件 / 循环里

### Bundle

- [ ] 大组件用 `next/dynamic` 切码(charts / editors / heavy form 等)
- [ ] 没从 `lucide-react` 的 barrel 之外的路径 import

### 防 hydration mismatch

- [ ] 读 `window` / `localStorage` 包 `useEffect`
- [ ] 服务端 / 客户端会不一致的 UI 用 `suppressHydrationWarning` 或 `dynamic({ ssr: false })`

---

## 启动前检查

```bash
[ ] pnpm install                                           # 装包成功
[ ] docker compose -f docker/docker-compose.yaml up -d     # 本地依赖起来
[ ] pnpm db:push                                           # 迁移成功
[ ] pnpm dev                                               # dev server 起来
[ ] curl http://localhost:3000/api/health                  # 返回 {"status":"ok"}
[ ] 浏览器打开 /                                            # 自动跳 SSO(未登录)或 /dashboard(已登录)
[ ] 主题色青绿 #17b3a3 出现在按钮 / focus ring
[ ] sidebar 菜单显示正常
[ ] /notes 可以增删改查
```

---

## 部署前检查

```bash
[ ] pnpm build                                             # 通过 + 没有 warning
[ ] .env.production 含全部必需变量                          # DATABASE_URL / REDIS_URL / NEXT_PUBLIC_* / NACOS_*
[ ] cache-handler.mjs 的 keyPrefix 与项目名匹配(避免多项目串)
[ ] images.remotePatterns 含所有要用到的外部图片域
[ ] standalone 输出能 docker 化 —— 运维确认 Dockerfile / k8s manifest
[ ] 健康检查路径(/api/health)接到 LB readiness probe
[ ] Nacos 注册:在 nacos 控制台能看到本服务的实例(若 NACOS_PROVIDER_ENABLED=true)
[ ] 跨实例 cache 失效:多副本场景,改一条数据后所有副本 read-your-writes(走 cache-handler.mjs + Redis)
```

---

## 紧急排障

| 症状 | 大概率原因 | 看哪 |
| --- | --- | --- |
| `Cannot find module '@openconsole/...'` | `next.config.ts` 漏 `transpilePackages` | `configs.md` |
| `Cookies/Headers must be awaited` | 用了 `cookies()` / `headers()` 没 `await` | Next 16 强制 async |
| `unauthorized is not a function` | `experimental.authInterrupts` 没开 | `next.config.ts` |
| Hydration mismatch | 服务端 / 客户端首屏不一致 | `theme.md` 防闪烁 / `useEffect` 包 window |
| `next/dist/...` build 报 native binding | `serverExternalPackages` 漏 | `next.config.ts` |
| pgbouncer 连接超时 | Docker 没起,或 N×POOL_MAX > 25 | `configs.md` env 段 |
| Nacos 注册不上 | NACOS_SERVER 错 / 网络 / docker 容器没启 | `docker compose logs nacos` |
| TanStack Query 报 dehydration error | Cache Components + 'use server' queryFn + HydrationBoundary | 模板用 `initialData` 不用 Hydration |
| `Module not found: server-only` | 客户端组件 import 了 server-only 模块 | 检查 import 链 |
| `'use cache' cannot use cookies()` | `_cached.ts` 里读 cookies | 把鉴权挪到 `actions.ts` |

---

## Skill 再读建议

每个版本升级 / 新人入职都过一次:

1. `SKILL.md` —— 触发与 5 条硬规则
2. `AGENTS.md` —— 全局架构
3. `references/scaffold.md` —— 文件蓝本
4. `references/directory-structure.md` —— 目录边界
5. `references/configs.md` —— 配置文件语义
6. `../ui/rules/library-whitelist.md` —— UI 严格白名单
7. `../ui/rules/theme.md` —— 主题色 / 字体 / 布局
8. `../nextjs-auth-callback/references/auth-flow.md` —— 登录链路
9. `references/data-layer.md` —— 数据流
10. `references/error-pages.md` —— 错误页
11. `references/features.md` —— 加新 feature
12. `references/checklist.md` —— 本文
