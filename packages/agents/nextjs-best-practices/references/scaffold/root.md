# Scaffold —— 根目录配置文件

> 项目根目录的 12 个配置文件。空目录初始化时**最先**写这些,框架 / 工具链才能跑起来。
>
> 占位符:`<PROJECT_NAME>` 替换为项目名(用于 `package.json` 的 `name`、`cache-handler.mjs` 的 `keyPrefix`);`<SERVICE_NAME>` 替换为 Nacos 注册的服务名(可与 `<PROJECT_NAME>` 相同)。

文件清单(创建顺序):

| # | 文件 | 用途 |
| --- | --- | --- |
| 1 | `.gitignore` | git 忽略规则 |
| 2 | `.env.local` | 本地环境变量(**不**提交)—— `DATABASE_URL` / `REDIS_URL` / `NACOS_*` 由用户在 SKILL.md Step 1 提供 |
| 3 | `package.json` | 依赖 + scripts |
| 4 | `pnpm-workspace.yaml` | pnpm 内部包白名单 |
| 5 | `tsconfig.json` | TypeScript 严格模式 |
| 6 | `next.config.ts` | standalone / cacheComponents / reactCompiler / cacheHandler |
| 7 | `postcss.config.mjs` | Tailwind v4 |
| 8 | `env.ts` | `@t3-oss/env-nextjs` 校验 |
| 9 | `proxy.ts` | Next 16 middleware,鉴权 + trace-id |
| 10 | `instrumentation.ts` | Nacos init + 错误日志 |
| 11 | `cache-handler.mjs` | Redis 共享缓存后端 |
| 12 | `drizzle.config.ts` | drizzle-kit 配置 |

---

## [1] `.gitignore`

```gitignore
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env
.env.*.local

# drizzle-kit: keep `drizzle/` (migration sources) committed; ignore meta
drizzle/meta/_journal.json.lock

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

## [2] `.env.local`

> **以下值全部由用户在 scaffold 流程开始时通过 AskUserQuestion 提供** —— 骨架不自带 docker-compose,所以 Postgres / Redis / Nacos 都是外部依赖。空目录初始化前必须先问完。占位符:
>
> - `<NEXT_PUBLIC_AUTH_URL>` —— 外部登录页根 URL(如 `https://login.example.com`)
> - `<NEXT_PUBLIC_APP_URL>` —— 本应用根 URL(如 `http://localhost:3000`)
> - `<DATABASE_URL>` —— Postgres 连接串。**直连**:`postgres://user:pwd@host:5432/db`;**经 pgbouncer transaction mode**:`postgres://user:pwd@host:6432/db`(本骨架 `lib/db/index.ts` 默认 `prepare: false`,两种都能跑)
> - `<REDIS_URL>` —— Redis 连接串(`redis://:pwd@host:6379`,或带 db 编号 `/0`)
> - `<NACOS_SERVER>` / `<NACOS_NAMESPACE>` / `<NACOS_USERNAME>` / `<NACOS_PASSWORD>` —— Nacos 注册中心(如 `127.0.0.1:8848`、`public`、`nacos`、`nacos`);**不接 Nacos** 时整段 `NACOS_*` 全删,并把 `NACOS_PROVIDER_ENABLED=false`
> - `<SERVICE_NAME>` —— 本服务在 Nacos 注册的名字(常与 `<PROJECT_NAME>` 相同)

```ini
NEXT_PUBLIC_AUTH_URL=<NEXT_PUBLIC_AUTH_URL>
NEXT_PUBLIC_APP_URL=<NEXT_PUBLIC_APP_URL>

# Postgres 连接串。直连 5432 或经 pgbouncer transaction mode 的 6432 都可以
# —— lib/db/index.ts 的 `prepare: false` 让两种都兼容。
DATABASE_URL=<DATABASE_URL>
# DATABASE_POOL_MAX=5    # per-instance pool;经 pgbouncer 时,N × max ≤ DEFAULT_POOL_SIZE

# Redis 共享端点。HA 拓扑(Sentinel / Cluster)由运维 / k8s Service / 代理屏蔽
# —— 应用只看到一个 URL。
REDIS_URL=<REDIS_URL>

# === Nacos 服务发现(可选) =================================
# 不需要 Nacos 时,把这一段全删,然后把 NACOS_PROVIDER_ENABLED=false
NACOS_SERVER=<NACOS_SERVER>
NACOS_NAMESPACE=<NACOS_NAMESPACE>
NACOS_USERNAME=<NACOS_USERNAME>
NACOS_PASSWORD=<NACOS_PASSWORD>

# Nacos provider —— 把本服务注册进 Nacos,其它服务可通过
# `nacos://<SERVICE_NAME>/...` 调本服务。包会自动填:
#   PORT      → $PORT(Next / k8s inject)
#   GROUP     → DEFAULT_GROUP
#   WEIGHT    → 1
#   EPHEMERAL → true(stateless app 正确选择)
#   IP        → POD_IP / HOST_IP / 第一个非 internal IPv4 / 127.0.0.1
# 需要覆盖时用 NACOS_PROVIDER_<NAME>。
NACOS_PROVIDER_ENABLED=true
NACOS_PROVIDER_SERVICE=<SERVICE_NAME>
```

## [3] `package.json`

> 字段 `"name"` 用 `<PROJECT_NAME>` 替换;其余保持。

```json
{
  "name": "<PROJECT_NAME>",
  "version": "0.0.0",
  "private": false,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "format": "prettier --write .",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:drop": "drizzle-kit drop"
  },
  "dependencies": {
    "@hookform/resolvers": "^5.2.2",
    "@lottiefiles/dotlottie-react": "^0.16.0",
    "@neshca/cache-handler": "^1.9.0",
    "@openconsole/atoms": "0.2.1",
    "@openconsole/nacos": "0.2.1",
    "@openconsole/shadcn": "0.2.1",
    "@radix-ui/react-accordion": "^1.2.12",
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-collapsible": "^1.1.12",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-separator": "^1.1.8",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@t3-oss/env-nextjs": "^0.13.11",
    "@tanstack/react-query": "^5.100.14",
    "@tanstack/react-table": "^8.21.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "consola": "^3.4.2",
    "date-fns": "^4.2.1",
    "drizzle-orm": "^0.45.2",
    "embla-carousel-react": "^8.6.0",
    "input-otp": "^1.4.2",
    "ioredis": "^5.10.1",
    "lucide-react": "^1.16.0",
    "nacos": "^2.6.0",
    "next": "16.2.6",
    "next-themes": "^0.4.6",
    "nextjs-toploader": "^3.9.17",
    "nuqs": "^2.8.9",
    "ofetch": "^1.5.1",
    "postgres": "^3.4.9",
    "radix-ui": "^1.4.3",
    "react": "19.2.6",
    "react-day-picker": "^9.14.0",
    "react-dom": "19.2.6",
    "react-hook-form": "^7.76.0",
    "react-resizable-panels": "^4.11.1",
    "recharts": "3.8.1",
    "redis": "^4.7.0",
    "server-only": "^0.0.1",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.6.0",
    "vaul": "^1.1.2",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.0",
    "@tanstack/react-query-devtools": "^5.100.14",
    "@types/node": "^25.9.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "babel-plugin-react-compiler": "^1.0.0",
    "dotenv": "^17.4.2",
    "drizzle-kit": "^0.31.10",
    "prettier": "^3.8.3",
    "tailwindcss": "^4.3.0",
    "tw-animate-css": "^1.4.0",
    "typescript": "^6.0.3"
  }
}
```

## [4] `pnpm-workspace.yaml`

```yaml
allowBuilds:
  esbuild: true
  sharp: true
  unrs-resolver: true
minimumReleaseAgeExclude:
  - '@openconsole/*'
```

## [5] `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

## [6] `next.config.ts`

```ts
import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  reactCompiler: true,
  cacheHandler: path.resolve(process.cwd(), "cache-handler.mjs"),
  transpilePackages: [
    "@openconsole/shadcn",
    "@openconsole/atoms",
    "@openconsole/nacos",
  ],
  serverExternalPackages: ["nacos"],
  experimental: {
    turbopackFileSystemCacheForDev: true,
    authInterrupts: true,
  },
};

export default nextConfig;
```

## [7] `postcss.config.mjs`

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

## [8] `env.ts`

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url().startsWith("postgres"),
    DATABASE_CASING: z.enum(["snake_case", "camelCase"]).default("snake_case"),
    // Per-instance Postgres client pool size. If the user's DATABASE_URL
    // points at pgbouncer in transaction mode, N×DATABASE_POOL_MAX must
    // stay ≤ pgbouncer DEFAULT_POOL_SIZE (configured on the operator side,
    // not by the scaffold). For direct Postgres, only PG's max_connections
    // matters. Default 5 is a conservative starting point.
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),

    // Shared by all app instances. If you run HA Redis (Sentinel / Cluster),
    // front it with a proxy (HAProxy-with-sentinel, k8s Service, etc.) and
    // point REDIS_URL at the single virtual endpoint — the app never needs
    // to know the underlying topology.
    REDIS_URL: z.url().startsWith("redis"),

    COOKIE_TOKEN: z.string().default("token"),
    COOKIE_TENANT_CODE: z.string().default("tenant_code"),
    COOKIE_CONTINUE: z.string().default("continue"),
    COOKIE_TOKEN_MAX_AGE: z.coerce.number().default(60 * 60 * 24 * 30),
    COOKIE_CONTINUE_MAX_AGE: z.coerce.number().default(60 * 5),

    // Nacos is zero-config: @openconsole/nacos reads NACOS_* directly from
    // process.env (NACOS_SERVER, NACOS_NAMESPACE, NACOS_USERNAME,
    // NACOS_PASSWORD, NACOS_BALANCER, NACOS_REQUEST_TIMEOUT, and provider
    // vars NACOS_PROVIDER_ENABLED / NACOS_PROVIDER_SERVICE /
    // NACOS_PROVIDER_PORT / …). No need to re-declare or validate them.
  },
  client: {
    NEXT_PUBLIC_AUTH_URL: z.url(),
    NEXT_PUBLIC_APP_URL: z.url(),
    NEXT_PUBLIC_API_PREFIX: z.string().default("/api"),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_PREFIX: process.env.NEXT_PUBLIC_API_PREFIX,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
```

## [9] `proxy.ts`

```ts
import { type NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { env } from "@/env";

const PUBLIC_PATHS = ["/"];

// Standard trace-id header name. Compatible with most observability tooling
// (Datadog, Honeycomb, OpenTelemetry shims) and with the nacos forward()
// plugin, which transparently re-injects all non-hop-by-hop request headers
// into downstream nacos:// calls — so the same trace-id reaches the BFF.
const REQUEST_ID_HEADER = "x-request-id";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasToken = request.cookies.has(env.COOKIE_TOKEN);

  // Mint or accept a trace id for this request. Set on BOTH the request
  // headers (so RSC / Server Actions / nacos.forward see it) and the
  // outgoing response (so the browser / LB / log pipeline can correlate).
  const requestId =
    request.headers.get(REQUEST_ID_HEADER) || crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  if (pathname === "/" && hasToken) {
    const redirect = NextResponse.redirect(
      new URL(siteConfig.defaultRedirect, request.url),
    );
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    return redirect;
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    const next = NextResponse.next({ request: { headers: requestHeaders } });
    next.headers.set(REQUEST_ID_HEADER, requestId);
    return next;
  }

  if (hasToken) {
    const next = NextResponse.next({ request: { headers: requestHeaders } });
    next.headers.set(REQUEST_ID_HEADER, requestId);
    return next;
  }

  const fragment = `redirect_uri=${encodeURIComponent(env.NEXT_PUBLIC_APP_URL)}&source=sso`;
  const loginUrl = new URL("/login", env.NEXT_PUBLIC_AUTH_URL);
  loginUrl.hash = fragment;

  const response = NextResponse.redirect(loginUrl);
  response.headers.set(REQUEST_ID_HEADER, requestId);

  if (request.headers.get("sec-fetch-dest") === "document") {
    response.cookies.set(env.COOKIE_CONTINUE, pathname + search, {
      maxAge: env.COOKIE_CONTINUE_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
```

## [10] `instrumentation.ts`

```ts
import type { Instrumentation } from "next";

import { scoped } from "./lib/logger";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { init } = await import("@openconsole/nacos");
  await init();
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const log = scoped("request-error");

  const err = error instanceof Error ? error : new Error(String(error));
  const digest =
    "digest" in err && typeof err.digest === "string" ? err.digest : undefined;

  log.error({
    digest,
    message: err.message,
    stack: err.stack,
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
  });
};
```

## [11] `cache-handler.mjs`

> `keyPrefix` 使用项目名作前缀,确保多个项目共用同一个 Redis 时不会互相串数据。

```js
// Custom Next.js cache handler — backs Cache Components (`'use cache'`),
// Data Cache, and full-route cache with Redis so multiple Next.js instances
// share a single source of truth. Without this, each instance's
// `updateTag()` / `revalidateTag()` only invalidates its own process-local
// store and users on a different replica keep seeing stale data.
//
// This file is loaded by Next.js in production builds only (see
// `next.config.ts`); `next dev` keeps using the default in-memory cache.
//
// All instances point at the SAME Redis service via REDIS_URL. HA topology
// (Sentinel / Cluster) lives behind that URL — the cache handler treats it
// as a single endpoint, same as the app's ioredis client.
//
// Redis is best-effort: a failed connect degrades to LRU-only rather than
// taking the app down — but invalidations then become per-process again
// until Redis recovers.

import { CacheHandler } from "@neshca/cache-handler";
import createLruHandler from "@neshca/cache-handler/local-lru";
import createRedisHandler from "@neshca/cache-handler/redis-strings";
import { createClient } from "redis";

CacheHandler.onCreation(async () => {
  const url = process.env.REDIS_URL;

  if (!url) {
    return { handlers: [createLruHandler()] };
  }

  const client = createClient({ url });
  client.on("error", (err) => {
    console.warn("[cache-handler] redis error:", err?.message ?? err);
  });

  try {
    await client.connect();
  } catch (err) {
    console.warn(
      "[cache-handler] redis connect failed, using in-memory LRU:",
      err?.message ?? err,
    );
    return { handlers: [createLruHandler()] };
  }

  const redisHandler = await createRedisHandler({
    client,
    keyPrefix: "<PROJECT_NAME>:cache:",
    timeoutMs: 1000,
  });

  return {
    handlers: [redisHandler, createLruHandler()],
  };
});

export default CacheHandler;
```

## [12] `drizzle.config.ts`

```ts
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { defineConfig } from "drizzle-kit";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required. Set it in .env.local or .env before running drizzle-kit.",
  );
}

const DATABASE_CASING = process.env.DATABASE_CASING ?? "snake_case";
if (DATABASE_CASING !== "snake_case" && DATABASE_CASING !== "camelCase") {
  throw new Error(
    `DATABASE_CASING must be 'snake_case' or 'camelCase' (got: ${DATABASE_CASING}).`,
  );
}

export default defineConfig({
  schema: "./lib/db/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: DATABASE_CASING,
  dbCredentials: { url: DATABASE_URL },
  strict: true,
  verbose: true,
});
```

---

下一步:[`app.md`](./app.md) —— `app/` 路由 + special files
