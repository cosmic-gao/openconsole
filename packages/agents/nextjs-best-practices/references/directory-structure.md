# Directory Structure —— 目录约定明细

> 模板的每一个目录、能放什么、不能放什么。AGENTS.md 的「目录结构」段是概览,
> 本文是逐目录的详解。

---

## 顶层目录速查表

| 目录 | 用途 | 哪些代码放这里 | 哪些**不**放 |
| --- | --- | --- | --- |
| `app/` | App Router 路由 + special files | `page.tsx` / `layout.tsx` / `error.tsx` / `route.ts` | 业务逻辑、可复用组件、数据访问 |
| `features/<domain>/` | 业务领域切片 | 该领域的 schema/action/component/hook/query/server util | 跨 domain 共用的工具 |
| `lib/` | 跨 feature 复用基建 | db / redis / query / request / logger / utils | 单领域专用的代码、UI 组件 |
| `config/` | 静态配置(无副作用) | `site.ts` / `sidebar.ts` 等纯数据 | 任何带状态 / 有副作用的代码 |
| `contexts/` | 跨 feature 的全局 Context | 真正跨 feature 的 Provider | 单 feature 用的 Context(放 `features/<domain>/contexts/`) |
| `drizzle/` | drizzle-kit 生成的迁移 | SQL 迁移 + meta | 手写 SQL、其它 ORM 文件 |
| `public/` | 静态资源 | favicon、图片、字体、robots.txt 等 | 任何代码 / 配置 |

> ⚠️ **根目录禁止出现**:`src/` / `components/` / `hooks/` / `utils/` / `pages/` /
> `services/` / `shared/` / `lib/api/` / `middleware.ts`(改名 `proxy.ts`)。

---

## `app/` —— 只放路由

### 文件命名

| 文件 | 作用 |
| --- | --- |
| `app/layout.tsx` | 根 layout —— 全局 Provider 链 |
| `app/page.tsx` | 首页 —— 模板里就是 `<SsoCallback />` |
| `app/globals.css` | Tailwind v4 入口 + 业务字体变量 |
| `app/error.tsx` | segment-level error boundary |
| `app/global-error.tsx` | root error boundary(渲染自己的 `<html>`) |
| `app/not-found.tsx` | `notFound()` 触发 |
| `app/unauthorized.tsx` | `unauthorized()` 触发 |
| `app/forbidden.tsx` | `forbidden()` 触发 |

### 路由组 (parentheses)

| 路由组 | 用途 |
| --- | --- |
| `app/(dashboard)/` | 共享 Dashboard 骨架(AuthProvider + Sidebar + Header) |
| `app/(errors)/` | 直接可访问的错误页(不是 boundary) |

### 子路由

```
app/(dashboard)/
├── layout.tsx                  # 整个 dashboard 共享的骨架
├── dashboard/page.tsx          # /dashboard
└── notes/page.tsx              # /notes
```

加新路由:在 `app/(dashboard)/<feature-name>/page.tsx` 创建。

### API 路由

```
app/api/
└── health/route.ts             # GET /api/health
```

**只放需要 HTTP 接口的东西**:webhook、健康检查、第三方回调。业务数据查询用 **Server Action**(放 `features/<domain>/actions.ts`),不要乱建 `/api/<resource>/route.ts`。

### `app/` 不允许放

- 业务组件:放 `features/<domain>/components/`
- 共享 hook:放 `features/<domain>/hooks/` 或 `lib/`
- 数据查询逻辑:放 `features/<domain>/actions.ts` + `_cached.ts`
- 工具函数:放 `lib/`

---

## `features/<domain>/` —— 业务领域切片

### 标准目录契约

```
features/<domain>/
├── schemas.ts                  # zod schemas (单一事实来源)
├── types.ts                    # 从 schemas 派生 + 其它 TS-only 类型(可选)
├── actions.ts                  # "use server" Server Actions
├── _cached.ts                  # "use cache" 读层(可选)
├── components/                 # React 组件(server / client)
├── contexts/                   # React Context(可选)
├── hooks/                      # 自定义 hooks(可选)
├── queries/                    # TanStack Query 选项 + key
│   ├── keys.ts
│   └── options.ts
└── server/                     # 仅服务端工具(非 Server Action,可选)
```

### 每个文件的职责

| 文件 | 必装 | 内容 |
| --- | --- | --- |
| `schemas.ts` | ✓ | 该 domain 用到的 zod schemas。每条 Server Action 入参都必须经过 `Schema.parse(input)`,**单一事实来源** |
| `types.ts` | 可选 | 从 schemas 派生类型(`type Foo = z.infer<typeof Foo>`)+ 其它纯 TS 类型(`type Session = ...`)。**不要**重复定义和 schema 一致的类型,从 schemas 推 |
| `actions.ts` | ✓(若有数据操作) | 文件首行 `"use server";` —— 该 domain 所有写操作 + 读操作的对外入口。失效缓存调 `updateTag(...)` |
| `_cached.ts` | 可选 | `"use cache"` 函数 —— deterministic 读取,可在多请求间缓存。**不能**调 cookies/headers/Date.now/Math.random |
| `components/<name>.tsx` | ✓(若有 UI) | client / server 组件。client 组件首行 `"use client";` |
| `contexts/<name>.tsx` | 可选 | 该 domain 的 React Context + Provider |
| `hooks/use-<name>.ts` | 可选 | 自定义 hooks。首行 `"use client";`(hooks 是 client-only) |
| `queries/keys.ts` | ✓(若用 TanStack Query) | query key 工厂:`xxxKeys.all()` / `xxxKeys.list()` / `xxxKeys.detail(id)` 等 |
| `queries/options.ts` | ✓(若用 TanStack Query) | `queryOptions({ queryKey, queryFn })`,queryFn 调 Server Action |
| `server/<name>.ts` | 可选 | 服务端工具(`import "server-only"`),如 session 读取。**不是** Server Action(没 `"use server"`) |

### 禁止

- **不要**在 `features/<domain>/index.ts` 里 re-export `actions.ts`:`"use server"` directive 必须在 import 点可见,re-export 会让客户端组件误以为是普通函数。
- **不要**跨 feature 直接 import 别人的 `_cached.ts` 或 `server/`:数据访问必须经过 Server Action(对应 feature 的 `actions.ts`)。
- **不要**把不属于本 domain 的代码塞进来:`auth/` 不要放别人的 user CRUD,加一个 `users/` 切片。

### 怎么决定开新 feature

| 信号 | 操作 |
| --- | --- |
| 一组新的 zod schemas + Server Action + 至少一个组件围绕同一个业务实体 | 开新 `features/<entity>/` |
| 只是一个 helper 函数 | 放 `lib/utils/` |
| 只是一个 UI 组件,没绑定具体业务 | 看能否进 `@openconsole/atoms`;否则放 `features/<相关 domain>/components/`,而不是单独开 feature |

详见 [`features.md`](./features.md)。

---

## `lib/` —— 跨 feature 复用基建

### 模板已经预置的子目录

| 子目录 | 内容 | 何时改 |
| --- | --- | --- |
| `lib/db/` | Drizzle 客户端 + schema | 加新表:`lib/db/schema/<table>.ts` + `lib/db/schema/index.ts` re-export |
| `lib/redis/` | ioredis 单例(应用层用,不是 cache backend) | 一般不动 |
| `lib/query/` | TanStack QueryClient + Provider | 一般不动 |
| `lib/request/` | BFF ofetch + envelope `{code,data,msg}` 协议 | 加新 envelope helper、调整 timeout |
| `lib/logger.ts` | consola 日志单例 + `scoped(tag)` | 一般不动 |

### 加新的 lib 子目录?

只有当**两个或更多 feature** 真正复用同一份代码,才开新 `lib/<name>/`。否则放回 feature 内部。

### 严格禁止

- `lib/api/` —— 跟 `app/api/` 冲突。HTTP 客户端在 `lib/request/`。
- `lib/shared/` / `lib/common/` —— 名字过于泛化,直接 `lib/<具体功能>/`。
- 在 `lib/` 里放业务 schema —— schema 跟 feature 走,放 `features/<domain>/schemas.ts`。

---

## `config/` —— 静态配置

只放**纯数据 + 纯类型**的文件,不能带副作用:

```ts
// ✅ config/site.ts
export const siteConfig = {
  name: "Shadcn Admin",
  description: "...",
  defaultRedirect: "/dashboard",
} as const;

// ❌ 带副作用,放错地方
export const siteConfig = {
  ...
  initOnBoot() { fetch("/api/init") },   // ❌
};
```

模板预置:

- `config/site.ts` —— 应用级常量
- `config/sidebar.ts` —— 侧边栏菜单数据;**icon 必须是字符串(PascalCase)**,因为这份数据会被 RSC 序列化到 client

加新的 config 文件:**继续在这里加**,不要建子目录,直到文件数 > 8 再考虑。

---

## `contexts/` —— 跨 feature 全局 Context

只放**真正跨多个 feature 的 Context**。例如:

- WebSocket 长连接(可能多个 feature 都要监听)
- 全局通知中心
- i18n locale

模板里这个目录是空的(`.gitkeep`),示意:**默认应该是空的**,需要才加。

单 feature 用的 Context 放 `features/<domain>/contexts/`(比如模板的 `features/auth/contexts/auth-context.tsx`)。

---

## `drizzle/` —— 数据库迁移

- `0000_*.sql`:迁移文件,**提交进 git**
- `meta/_journal.json`:drizzle-kit 维护,**提交**
- `meta/<num>_snapshot.json`:每次迁移的 schema 快照,**提交**
- `meta/_journal.json.lock`:文件锁,**.gitignore 已忽略**

### 工作流

```bash
# 1. 改 lib/db/schema/<table>.ts
# 2. 生成迁移文件
pnpm db:generate
# 3. dev 直推(本地)
pnpm db:push
# 4. 生产环境(在部署前)
pnpm db:migrate
```

不要手写 SQL,让 drizzle-kit 生成。需要数据迁移脚本(改数据不改 schema)再单独写。

---

## 外部依赖(Postgres / Redis / Nacos)

骨架**不包含** `docker/` 目录。Postgres / Redis / Nacos 都是外部依赖,由运维 / 平台提供:

- 连接串通过 `.env.local` 注入(scaffold 流程 Step 2 问用户)
- 本地开发需要起服务时,自己 `docker run` 或装本机服务,跟骨架解耦
- 生产部署的 Dockerfile 由运维基于 `output: "standalone"` 另出

`lib/db/index.ts` 的 `prepare: false` 让 Postgres **直连 5432** 与 **经 pgbouncer transaction mode 6432** 两种部署都兼容。

---

## `public/` —— 静态资源

放 favicon、机器人协议、各种 og:image。

**注意**:

- 大文件(> 1MB)请用 CDN,不要进 git
- 不要放 .env / 密钥 / 配置(public/ 任何文件都暴露在外网)

---

## 根目录配置文件清单

| 文件 | 改不改 |
| --- | --- |
| `package.json` | 只改 `name` / 加 dep |
| `tsconfig.json` | 不改 |
| `next.config.ts` | 加新 `images.remotePatterns` / 改 `transpilePackages`(慎重) |
| `postcss.config.mjs` | 不改 |
| `pnpm-workspace.yaml` | 不改 |
| `env.ts` | 加新 env 变量必须改这里(schema 双写 server + client + runtimeEnv) |
| `proxy.ts` | 改 PUBLIC_PATHS 或加自定义跳转规则;**不能改名** |
| `instrumentation.ts` | 加新启动初始化逻辑(如 Sentry init) |
| `cache-handler.mjs` | 一般不改;改 `keyPrefix` 避免多项目串数据 |
| `drizzle.config.ts` | 一般不改 |
| `.env.local` | 加新 env 必须同步到 `env.ts` |
| `.gitignore` | 一般不改 |

详见 [`configs.md`](./configs.md)。
