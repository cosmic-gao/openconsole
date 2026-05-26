# Configs —— 每个配置文件的作用与改造规则

> SKILL.md / AGENTS.md 已经列出哪些文件要存在,本文逐文件解释**为什么这样写**、
> **改了会怎样**、**何时该改**。Scaffold 的代码已经在 `scaffold.md`,本文专注语义。

---

## `next.config.ts`

```ts
{
  output: "standalone",
  cacheComponents: true,
  reactCompiler: true,
  cacheHandler: path.resolve(process.cwd(), "cache-handler.mjs"),
  transpilePackages: ["@openconsole/shadcn", "@openconsole/atoms", "@openconsole/nacos"],
  serverExternalPackages: ["nacos"],
  experimental: {
    turbopackFileSystemCacheForDev: true,
    authInterrupts: true,
  },
}
```

| 字段 | 作用 | 改了会怎样 |
| --- | --- | --- |
| `output: "standalone"` | 生产构建产出独立可执行 `node_modules` 子集,便于 Docker / k8s 部署 | 去掉就只能用 `next start`,镜像体积变大 |
| `cacheComponents: true` | 启用 Next 16 Cache Components(`'use cache'` directive 必需) | 去掉所有 `_cached.ts` / `'use cache'` 失效 |
| `reactCompiler: true` | React 19 Compiler 自动 memo | 去掉性能下降,但不影响功能 |
| `cacheHandler: <abs path>` | 用自定义 cache handler 替换默认内存 cache(走 Redis) | 去掉则多实例间 `revalidateTag` / `updateTag` 不互通 |
| `transpilePackages: [@openconsole/*]` | monorepo 内部包是 TS 源码,需要 Next 转译 | 漏掉某个包就会运行时报 `Cannot find module` |
| `serverExternalPackages: ["nacos"]` | nacos SDK 是 commonjs + native,不打包进 serverless bundle | 去掉会 webpack 报 native binding 错误 |
| `experimental.authInterrupts: true` | 启用 `unauthorized()` / `forbidden()` 函数 | 去掉那两个函数会抛 `not supported` |
| `experimental.turbopackFileSystemCacheForDev` | Turbopack dev 文件系统缓存 | 去掉只是 dev 启动变慢 |

### 何时改

- **加图片域名**:在 `images.remotePatterns` 添白名单
- **新加内部包**:加到 `transpilePackages`
- **打包 native module 出错**:加到 `serverExternalPackages`

---

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "verbatimModuleSyntax": true,
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "paths": { "@/*": ["./*"] }
  }
}
```

| 字段 | 必须 | 原因 |
| --- | --- | --- |
| `"strict": true` | 必须 | 公司编码规范 |
| `"verbatimModuleSyntax": true` | 必须 | 强制 `import type` / `export type` 区分,防止运行时副作用 |
| `"moduleResolution": "bundler"` | 必须 | Next 16 + TS 6 推荐 |
| `paths.@/*` | 必须 | 与 `app/(dashboard)/notes/page.tsx` 等里的 `@/lib/...` 对应 |
| `"jsx": "react-jsx"` | 必须 | React 17+ 自动 jsx runtime |
| `"plugins": [{ "name": "next" }]` | 必须 | Next 16 类型提示 |
| `"incremental": true` | 推荐 | 加速重复 tsc |

**禁止**:关 `strict` 或关 `verbatimModuleSyntax`。

---

## `postcss.config.mjs`

```js
{ plugins: { "@tailwindcss/postcss": {} } }
```

唯一插件。Tailwind v4 内置 autoprefixer / nesting,**不需要**:

- `autoprefixer` —— v4 内置
- `postcss-nesting` —— v4 内置
- `cssnano` —— Next 已经 minify

---

## `pnpm-workspace.yaml`

```yaml
allowBuilds:
  esbuild: true
  sharp: true
  unrs-resolver: true
minimumReleaseAgeExclude:
  - '@openconsole/*'
```

| 字段 | 作用 |
| --- | --- |
| `allowBuilds.<name>: true` | 允许这些包跑 postinstall script(默认 pnpm 阻止) |
| `minimumReleaseAgeExclude: ["@openconsole/*"]` | 跳过 minimum release age 检查 —— 内部包发了立刻能用 |

**不要**改 —— 改了内部包就装不上,或者构建失败。

---

## `env.ts`

```ts
createEnv({
  server: { DATABASE_URL, REDIS_URL, COOKIE_*, ... },
  client: { NEXT_PUBLIC_AUTH_URL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_API_PREFIX },
  experimental__runtimeEnv: { NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL, ... },
  emptyStringAsUndefined: true,
})
```

### 三段必须同步

1. `server` schema —— 服务端可读
2. `client` schema —— **必须** `NEXT_PUBLIC_` 前缀,客户端可读
3. `experimental__runtimeEnv` 映射 —— **每个 client 端字段都要在这写一次**,否则运行时拿不到值

**禁止**:

- 直接读 `process.env.X` —— 永远用 `env.X`(类型安全 + Zod 校验)
- 漏掉 `runtimeEnv` 映射 —— Vercel / Docker 都会读不到

### 加新变量

**Server 端变量**:

```diff
  server: {
    ...
+   MY_NEW_VAR: z.string().min(1),
  },
```

**Client 端变量(必须 `NEXT_PUBLIC_` 前缀)**:

```diff
  client: {
    ...
+   NEXT_PUBLIC_MY_VAR: z.string().min(1),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
+   NEXT_PUBLIC_MY_VAR: process.env.NEXT_PUBLIC_MY_VAR,
  },
```

### Nacos 变量是例外

Nacos 相关的 env(`NACOS_SERVER`、`NACOS_PROVIDER_*` 等)**不需要**写进 `env.ts` —— `@openconsole/nacos` 直接读 `process.env`(零配置)。

---

## `proxy.ts`(Next 16 middleware,改了名)

### Next 16 改动:`middleware.ts` 改名 `proxy.ts`

文件命名是 Next 16 的硬约定,**不能改回 `middleware.ts`**。

### 模板的 proxy.ts 做的事

1. **trace-id 注入**:每个请求生成 / 透传 `x-request-id`,同时写到请求头(给下游 RSC / Server Action / nacos.forward 看)和响应头(给浏览器 / LB / 日志)
2. **公开路径放行**:`PUBLIC_PATHS = ["/"]` —— 根路径不强制鉴权(因为是 SSO callback 落点)
3. **未登录跳 SSO**:没有 `token` cookie 时:
   - 写 `continue` cookie 记录原路径(只对 document 请求)
   - 重定向到 `NEXT_PUBLIC_AUTH_URL/login#redirect_uri=...&source=sso`
4. **已登录访问 `/` 自动跳 `defaultRedirect`**:省一次 SsoCallback 重定向

### 何时改

- 添加新公共路径(不需要登录):往 `PUBLIC_PATHS` 加
- 修改 trace-id header 名称:改 `REQUEST_ID_HEADER` 常量(同步通知运维 / 观测)
- 添加 IP 白名单 / rate limit:在 hasToken 检查前加新逻辑(注意 matcher 已经 exclude 了静态资源)

### 不要改

- `matcher` —— 已经精心调校过排除静态资源
- 重定向到 SSO 的 fragment 格式 —— 与 SSO 服务约定一致

---

## `instrumentation.ts`

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { init } = await import("@openconsole/nacos");
  await init();
}

export const onRequestError = async (error, request, context) => { ... };
```

### `register`

- 启动 Nacos(读 `NACOS_*` env,零配置)
- **必须**守护 `NEXT_RUNTIME !== "nodejs"` —— Edge runtime 跑会抛错

加新启动逻辑(Sentry / OpenTelemetry init):写在 `register` 函数里。

### `onRequestError`

- Next 16 提供的 server error hook,捕获 RSC / Server Action / Route Handler 中未捕获错误
- 模板写到 `lib/logger` 的 consola

加 Sentry 上报:在这里调 `Sentry.captureException(error, { extra: context })`。

---

## `cache-handler.mjs`

### 何时生效

- **生产构建**(`next build` + `next start`):使用本文件
- **dev**:Next 用默认内存 cache,**不**走本文件

### 策略

1. 没有 `REDIS_URL` → 退化到 LRU(单进程,多实例间数据隔离 —— 注意 `revalidateTag` 跨实例失效)
2. 有 `REDIS_URL` → Redis + LRU 双层(Redis 权威,LRU 读快)
3. Redis 连不上 → 降级 LRU(应用仍能跑,只是失效不跨实例)

### 何时改

- 改 `keyPrefix`:多个项目共用同一个 Redis 时必须改,避免串数据
- 改 `timeoutMs`:Redis 慢时调大或调小

### 不要改

- 默认双层结构(Redis 第一,LRU 第二)
- LRU fallback 路径 —— 这是降级保护

---

## `drizzle.config.ts`

```ts
{
  schema: "./lib/db/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url: DATABASE_URL },
  strict: true,
  verbose: true,
}
```

| 字段 | 作用 |
| --- | --- |
| `schema: "./lib/db/schema/*.ts"` | 自动扫描 schema/ 下所有 `.ts` |
| `out: "./drizzle"` | 迁移产物落地 |
| `casing: "snake_case"` | 数据库列名规范(JS 端 `camelCase`,SQL 端 `snake_case`) |
| `strict: true` | 拒绝模糊的 schema(更安全) |

加新表:`lib/db/schema/<table>.ts` + `lib/db/schema/index.ts` re-export。drizzle-kit 自动扫到。

---

## `.env.local`

### 必填

```bash
NEXT_PUBLIC_AUTH_URL=https://<SSO 站>
NEXT_PUBLIC_APP_URL=http://localhost:3000

DATABASE_URL=postgres://postgres:123456@localhost:6432/postgres
REDIS_URL=redis://:123456@localhost:6379

NACOS_SERVER=127.0.0.1:8848
NACOS_NAMESPACE=public
NACOS_USERNAME=nacos
NACOS_PASSWORD=nacos

NACOS_PROVIDER_ENABLED=true
NACOS_PROVIDER_SERVICE=<your-service>
```

### 注意

- **不要**提交 `.env.local`(已 `.gitignore`)
- 生产用 k8s ConfigMap / Secret 注入,不是 `.env.local`
- `NEXT_PUBLIC_*` 在 build 时打包进客户端 bundle,不要把 secrets 加 `NEXT_PUBLIC_` 前缀

### 可选

```bash
DATABASE_POOL_MAX=5          # 默认 5,N × max ≤ pgbouncer DEFAULT_POOL_SIZE
DATABASE_CASING=snake_case    # 默认 snake_case;改 camelCase 同步改 drizzle.config.ts

COOKIE_TOKEN=token            # 默认 token
COOKIE_TENANT_CODE=tenant_code
COOKIE_CONTINUE=continue
COOKIE_TOKEN_MAX_AGE=2592000  # 30 天
COOKIE_CONTINUE_MAX_AGE=300   # 5 分钟

NACOS_BALANCER=weighted       # round-robin / random / sticky
NACOS_REQUEST_TIMEOUT=10000   # 毫秒
NACOS_RETRY_ATTEMPTS=1
NACOS_DISCOVERY_TTL=5000      # 实例列表缓存 TTL
NACOS_CONFIG_SOURCES=app.json:app   # dataId[@group][:key],逗号分隔
NACOS_CONFIG_TAG=app-config    # config 变更时触发的 cache tag
```

---

## `config/site.ts`

```ts
export const siteConfig = {
  name: "Shadcn Admin",
  description: "Shadcn Admin Dashboard",
  defaultRedirect: "/dashboard",
} as const;
```

- `name`:写到 `<title>` / 默认 metadata
- `description`:写到 `<meta name="description">` / 默认 metadata
- `defaultRedirect`:登录后没 continue cookie 时的默认目的地;`proxy.ts` 里 `/` 已登录也跳这

加新站点常量(`supportEmail` / `corpName` 等):往里加,然后用 `as const` 保留字面量类型。

---

## `config/sidebar.ts`

```ts
import type { SidebarProps } from "@openconsole/atoms";

export const siderConfig: Pick<SidebarProps, "brand" | "menu"> = {
  brand: { name: "...", logo: "Command", description: "..." },
  menu: [
    { items: [{ label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" }] },
  ],
};
```

### 关键约束:icon 必须是字符串

**为什么**:这份数据被 RSC 渲染(`app/(dashboard)/layout.tsx`)然后传给 `<Sidebar>` 客户端组件,React 组件不可序列化。所以 icon 是 **lucide-react 图标名字符串**,由 `<Icon name={...}>` 在 client 端查表渲染。

### 加菜单项

```ts
menu: [
  { label: "主菜单", items: [
    { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
    { label: "Notes", href: "/notes", icon: "NotebookPen" },
    // 嵌套:children 渲染为可折叠子菜单
    { label: "Orders", icon: "ShoppingCart", children: [
      { label: "All", href: "/orders" },
      { label: "Refunds", href: "/orders/refunds" },
    ]},
    // badge
    { label: "Beta", href: "/beta", icon: "Sparkles", badge: "NEW", badgeColor: "violet" },
  ]},
  { label: "管理", items: [...] },  // 第二组
]
```

### 加底部账号下拉

```ts
import type { User } from "@openconsole/atoms";

const account: User = {
  name: "张三",
  email: "san@example.com",
  menu: [
    { label: "Profile", icon: "User", href: "/profile" },
    { label: "Billing", icon: "CreditCard", href: "/billing" },
    { separator: true, label: "Sign out", icon: "LogOut", destructive: true,
      onSelect: () => signOut() },
  ],
};

// 传给 <Sidebar account={account} />
```

注意:`account.menu[i].onSelect` 是函数,**不可序列化** —— 必须在客户端组件里构造(比如 `(dashboard)/layout.tsx` 因为里面用了 `AuthProvider` 是 `"use client"` 的间接消费者,但 layout 本身仍是 RSC)。最安全的做法是 account 数据完全在客户端组件里构造,然后传给 `<Sidebar>`,不要塞进 `config/sidebar.ts`。

---

## `lib/logger.ts`

```ts
export const logger = createConsola({
  level: process.env.NODE_ENV === "production" ? 3 : 4,
  defaults: { tag: "app" },
});

export const scoped = (tag: string) => logger.withTag(tag);
```

### 用法

```ts
import { scoped } from "@/lib/logger";

const log = scoped("notes-action");
log.info({ noteId: 1 }, "creating note");
log.error({ err }, "failed to create note");
```

### 不要做

- 不要 `console.log` —— 在生产里抓不到 / 没法 grep
- 不要直接用 `logger` —— 永远 `scoped(tag)`,每条日志都有上下文

---

## 总结清单

加新业务前,先回答这几个问题:

| 问题 | 答案 |
| --- | --- |
| 新的 env 变量? | 改 `env.ts` 双写 + `.env.local` |
| 新的数据库表? | `lib/db/schema/<name>.ts` + `index.ts` re-export + `pnpm db:generate` |
| 新的路由? | `app/(dashboard)/<feature>/page.tsx` + sidebar config 加一项 |
| 新的 Server Action / 写操作? | `features/<feature>/actions.ts` |
| 新的可缓存读? | `features/<feature>/_cached.ts` |
| 新的 BFF 调用? | 直接用 `lib/request` 的 `request` + `safeUnwrap(Schema, ...)` |
| 新的图片域? | `next.config.ts` 的 `images.remotePatterns` |
| 新的 lucide 图标? | 直接 import 用,**不**要额外配置 |
| 新的 UI 组件? | 先翻 `@openconsole/atoms` 和 `@openconsole/shadcn`;没有的话拼装,放 `features/<feature>/components/` |
