# Scaffold —— 完整文件蓝图

> 从空目录到可运行的统一 Next.js 应用,逐文件 Write。每个 `###` 标题就是文件路径,
> 下方代码块就是该文件的**完整**内容。除特别注明的占位符外,**一字不改**。
>
> 三个值由用户在 SKILL.md Step 1 填入:`<PROJECT_NAME>` / `<SERVICE_NAME>` /
> `<DEFAULT_REDIRECT>`(默认 `/dashboard`)。
> 占位符里出现的 `<PROJECT_NAME>` 都要替换;`<SERVICE_NAME>` 用于 Nacos 注册 / docker
> 容器名;`<DEFAULT_REDIRECT>` 用于 `config/site.ts` 的 `defaultRedirect`。

---

## 文件清单(创建顺序)

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
├── docker/
│   └── docker-compose.yaml                    [65]
│
└── public/
    ├── favicon.png                            [66] (二进制,任意 32×32 png)
    └── loading.json                           [67] (可选 Lottie 动画 JSON)
```

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

```ini
NEXT_PUBLIC_AUTH_URL=https://appstg.mspbots.ai
NEXT_PUBLIC_APP_URL=http://localhost:3000

DATABASE_URL=postgres://postgres:123456@localhost:6432/postgres
# DATABASE_POOL_MAX=5    # per-instance pg pool size; N × this ≤ pgbouncer DEFAULT_POOL_SIZE

# Shared by all app instances. HA topology (Sentinel / Cluster) lives
# behind this URL — front it with a proxy / k8s Service if needed.
REDIS_URL=redis://:123456@localhost:6379

NACOS_SERVER=127.0.0.1:8848
NACOS_NAMESPACE=public
NACOS_USERNAME=nacos
NACOS_PASSWORD=nacos

# Nacos provider — register THIS service so other services can call it via
# `nacos://<SERVICE_NAME>/...`. Only the two below are required; the package
# auto-fills the rest:
#   PORT      → $PORT  (Next / k8s inject)
#   GROUP     → DEFAULT_GROUP
#   WEIGHT    → 1
#   EPHEMERAL → true   (correct for stateless apps)
#   IP        → POD_IP / HOST_IP / first non-internal IPv4 / 127.0.0.1
# Override any of them with NACOS_PROVIDER_<NAME> when needed.
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
    // Per-instance Postgres client pool size. With pgbouncer in transaction
    // mode, N×DATABASE_POOL_MAX must stay ≤ pgbouncer DEFAULT_POOL_SIZE (25
    // in docker/docker-compose.yaml). Default 5 lets up to 5 Next.js
    // instances saturate the bouncer without queuing.
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

## App Router

## [13] `app/globals.css`

```css
@import "tailwindcss";
@import "@openconsole/shadcn/styles.css";
@import "@openconsole/atoms/styles.css";

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-inter: var(--font-inter);
  --font-manrope: var(--font-manrope);
}
```

## [14] `app/layout.tsx`

```tsx
import "./globals.css";

import { FontProvider, ThemeProvider } from "@openconsole/atoms";
import { Toaster } from "@openconsole/shadcn";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Manrope } from "next/font/google";
import NextToploader from "nextjs-toploader";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { siteConfig } from "@/config/site";
import { QueryProvider } from "@/lib/query";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="font-inter" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var font = localStorage.getItem('openconsole-font');
                  if (font && ['inter', 'manrope', 'system'].includes(font)) {
                    document.documentElement.classList.remove('font-inter');
                    document.documentElement.classList.add('font-' + font);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${manrope.variable} antialiased`}
      >
        <NuqsAdapter>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <FontProvider>
              <QueryProvider>
                <NextToploader color="var(--primary)" showSpinner={false} />
                {children}
                <Toaster />
              </QueryProvider>
            </FontProvider>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
```

## [15] `app/page.tsx`

```tsx
import { SsoCallback } from "@/features/auth/components/sso-callback";

export default function Home() {
  return <SsoCallback />;
}
```

## [15b] `app/loading.tsx`

> 全局 Suspense fallback —— 任何 route 流式渲染时显示这个 Lottie 动画。

```tsx
"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

// Root-level loading UI — Next.js renders this as the Suspense fallback
// whenever any route in app/ is streaming. The player is "use client" by
// necessity (canvas / DOM), but that's fine: loading.tsx is purely a
// fallback, not a streaming surface itself.
//
// Animation source: public/loading.json (Lottie JSON format). To swap, drop
// a new file into public/ and update `src` (DotLottieReact accepts both
// `.lottie` and `.json`).
export default function Loading() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center">
      <DotLottieReact
        src="/loading.json"
        loop
        autoplay
        className="size-48"
      />
    </div>
  );
}
```

## [16] `app/error.tsx`

```tsx
"use client";

import { ServerError } from "@openconsole/atoms";
import { Button } from "@openconsole/shadcn";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app:error]", error);
  }, [error]);

  return (
    <ServerError
      description={
        error.message ||
        "An unexpected error occurred. Please try again later."
      }
      actions={
        <Button onClick={reset} className="cursor-pointer">
          <RotateCcw />
          Try again
        </Button>
      }
    />
  );
}
```

## [17] `app/global-error.tsx`

```tsx
"use client";

import { ServerError } from "@openconsole/atoms";
import { Button } from "@openconsole/shadcn";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app:global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ServerError
          description={
            error.message ||
            "An unexpected error occurred. Please try again later."
          }
          actions={
            <Button onClick={reset} className="cursor-pointer">
              <RotateCcw />
              Try again
            </Button>
          }
        />
      </body>
    </html>
  );
}
```

## [18] `app/not-found.tsx`

```tsx
import { NotFound } from "@openconsole/atoms";

export default function NotFoundPage() {
  return <NotFound />;
}
```

## [19] `app/unauthorized.tsx`

```tsx
import { Unauthorized } from "@openconsole/atoms";

export default function UnauthorizedPage() {
  return <Unauthorized />;
}
```

## [20] `app/forbidden.tsx`

```tsx
import { Forbidden } from "@openconsole/atoms";

export default function ForbiddenPage() {
  return <Forbidden />;
}
```

## [21] `app/(dashboard)/layout.tsx`

```tsx
import {
  Header,
  LayoutProvider,
  Sidebar,
  SidebarProvider,
} from "@openconsole/atoms";
import { SidebarInset } from "@openconsole/shadcn";
import { Suspense } from "react";

import { siderConfig } from "@/config/sidebar";
import { AuthProvider } from "@/features/auth/contexts/auth-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <LayoutProvider>
        <SidebarProvider>
          <Sidebar brand={siderConfig.brand} menu={siderConfig.menu} />
          <SidebarInset>
            <Suspense>
              <Header />
            </Suspense>
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </AuthProvider>
  );
}
```

## [22] `app/(dashboard)/dashboard/page.tsx`

```tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@openconsole/shadcn";
import { Database, NotebookPen, Sparkles } from "lucide-react";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import { useAuth } from "@/features/auth/hooks/use-auth";

export default function DashboardPage() {
  const { user } = useAuth();
  const name = user?.realName || user?.username || "there";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {name}.
        </h1>
        <p className="text-muted-foreground text-base">{siteConfig.description}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink
          href="/notes"
          icon={<NotebookPen className="size-5" />}
          title="Notes"
          description="CRUD demo backed by Drizzle + Postgres, cached with updateTag invalidation."
        />
        <QuickLink
          href="https://nextjs.org/docs/app/getting-started/caching-and-revalidating"
          icon={<Sparkles className="size-5" />}
          title="Cache Components"
          description="See how 'use cache', cacheTag, and cacheLife shape the data layer."
          external
        />
        <QuickLink
          href="https://orm.drizzle.team/docs/overview"
          icon={<Database className="size-5" />}
          title="Drizzle ORM"
          description="Schema, migrations, and typed queries — the source of truth for the DB."
          external
        />
      </section>
    </div>
  );
}

type QuickLinkProps = {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  external?: boolean;
};

function QuickLink({ href, icon, title, description, external }: QuickLinkProps) {
  const linkProps = external ? { target: "_blank", rel: "noreferrer" as const } : {};
  return (
    <Link href={href} {...linkProps} className="group">
      <Card className="hover:border-primary/40 h-full transition-colors">
        <CardHeader>
          <div className="text-muted-foreground group-hover:text-foreground bg-muted flex size-9 items-center justify-center rounded-md transition-colors">
            {icon}
          </div>
          <CardTitle className="mt-3">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </Link>
  );
}
```

## [23] `app/(dashboard)/notes/page.tsx`

```tsx
import { Suspense } from "react";

import { listNotes } from "@/features/notes/actions";
import { NotesTable } from "@/features/notes/components/notes-table";

export const metadata = {
  title: "Notes",
};

export default function NotesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Notes</h1>
        <p className="text-muted-foreground text-sm">
          Create, edit, and remove notes — persisted in Postgres via Drizzle.
        </p>
      </header>

      <Suspense fallback={<NotesSkeleton />}>
        <NotesShell />
      </Suspense>
    </div>
  );
}

async function NotesShell() {
  const data = await listNotes();
  return (
    <div className="space-y-4">
      <NotesTable initialData={data} />
    </div>
  );
}

function NotesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-muted h-10 animate-pulse rounded-md" />
      <div className="bg-muted h-64 animate-pulse rounded-md" />
    </div>
  );
}
```

## [24-28] `app/(errors)/*/page.tsx`

```tsx
// app/(errors)/error/page.tsx
import { ServerError } from "@openconsole/atoms";
export const metadata = { title: "500 — Internal Server Error" };
export default function ServerErrorPage() { return <ServerError />; }

// app/(errors)/forbidden/page.tsx
import { Forbidden } from "@openconsole/atoms";
export const metadata = { title: "403 — Forbidden" };
export default function ForbiddenPage() { return <Forbidden />; }

// app/(errors)/maintenance/page.tsx
import { Maintenance } from "@openconsole/atoms";
export const metadata = { title: "503 — Maintenance" };
export default function MaintenancePage() { return <Maintenance />; }

// app/(errors)/not-found/page.tsx
import { NotFound } from "@openconsole/atoms";
export const metadata = { title: "404 — Not Found" };
export default function NotFoundPage() { return <NotFound />; }

// app/(errors)/unauthorized/page.tsx
import { Unauthorized } from "@openconsole/atoms";
export const metadata = { title: "401 — Unauthorized" };
export default function UnauthorizedPage() { return <Unauthorized />; }
```

## [29] `app/api/health/route.ts`

```ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
```

---

## Config

## [30] `config/site.ts`

> `name` 与 `defaultRedirect` 用用户在 SKILL.md Step 1/3 填入的值替换。

```ts
export const siteConfig = {
  name: "<PROJECT_DISPLAY_NAME>",
  description: "<PROJECT_DISPLAY_NAME> Dashboard",
  defaultRedirect: "<DEFAULT_REDIRECT>",
} as const;
```

## [31] `config/sidebar.ts`

```ts
import type { SidebarProps } from "@openconsole/atoms";

export const siderConfig: Pick<SidebarProps, "brand" | "menu"> = {
  brand: {
    name: "<PROJECT_DISPLAY_NAME>",
    logo: "Command",
    description: "NextJs + ShadcnUI",
  },
  menu: [
    {
      items: [
        {
          label: "Dashboard",
          href: "/dashboard",
          icon: "LayoutDashboard",
        },
        {
          label: "Notes",
          href: "/notes",
          icon: "NotebookPen",
        },
      ],
    },
  ],
};
```

---

## Lib

## [32] `lib/logger.ts`

```ts
import { createConsola } from "consola";

export const logger = createConsola({
  level: process.env.NODE_ENV === "production" ? 3 : 4,
  defaults: { tag: "app" },
});

export const scoped = (tag: string) => logger.withTag(tag);
```

## [33] `lib/db/index.ts`

```ts
import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";

import * as schema from "./schema";


const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__pgClient ??
  postgres(env.DATABASE_URL, {
    max: env.DATABASE_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__pgClient = client;

export const db = drizzle({ client, schema, casing: env.DATABASE_CASING });
export type Database = typeof db;
```

## [34] `lib/db/schema/index.ts`

```ts
export * from "./notes";
```

## [35] `lib/db/schema/notes.ts`

```ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
```

## [36] `lib/redis/client.ts`

```ts
import "server-only";

import Redis from "ioredis";

import { env } from "@/env";

const globalForRedis = globalThis as unknown as {
  __redisClient?: Redis;
};

export const redis =
  globalForRedis.__redisClient ??
  new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 5000);
    },
    reconnectOnError(error) {
      return error.message.includes("READONLY");
    },
  });

if (process.env.NODE_ENV !== "production") globalForRedis.__redisClient = redis;

export type RedisClient = typeof redis;
```

## [37] `lib/redis/index.ts`

```ts
export { redis, type RedisClient } from "./client";
```

## [38] `lib/query/client.ts`

```ts
import {
  QueryClient,
  defaultShouldDehydrateQuery,
  environmentManager,
} from "@tanstack/react-query";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
```

## [39] `lib/query/provider.tsx`

```tsx
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { getQueryClient } from "./client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools />
    </QueryClientProvider>
  );
}
```

## [40] `lib/query/index.ts`

```ts
export { getQueryClient } from "./client";
export { QueryProvider } from "./provider";
```

## [41] `lib/request/client.ts`

```ts
import "server-only";

import { ofetch } from "ofetch";

import { env } from "@/env";
import { getSessionHeaders } from "@/features/auth/server/session";

export const request = ofetch.create({
  baseURL: env.NEXT_PUBLIC_AUTH_URL,
  retry: 1,
  retryDelay: 300,
  timeout: 15_000,
  async onRequest({ options }) {
    const session = await getSessionHeaders();
    const headers = new Headers(options.headers);
    for (const [key, value] of Object.entries(session)) {
      headers.set(key, value);
    }
    options.headers = headers;
  },
});
```

## [42] `lib/request/types.ts`

```ts
import { z, type ZodType } from "zod";

export type ApiResponse<T> = {
  code: number;
  data: T;
  msg: string;
};

export function codeToStatus(code: number): number {
  if (code === 0) return 200;
  if (code >= 400 && code < 600) return code;
  return 500;
}

export class ApiError extends Error {
  readonly code: number;
  readonly status: number;

  constructor(code: number, message: string) {
    super(message || `Request failed (code=${code})`);
    this.name = "ApiError";
    this.code = code;
    this.status = codeToStatus(code);
  }
}

export function envelope<T extends ZodType>(data: T) {
  return z.object({
    code: z.number(),
    data,
    msg: z.string(),
  });
}

export async function unwrap<T>(promise: Promise<ApiResponse<T>>): Promise<T> {
  const res = await promise;
  if (res.code !== 0) throw new ApiError(res.code, res.msg);
  return res.data;
}

export async function safeUnwrap<T extends ZodType>(
  schema: T,
  promise: Promise<unknown>,
): Promise<z.infer<T>> {
  const raw = await promise;
  const parsed = envelope(schema).safeParse(raw);

  if (!parsed.success) {
    throw new ApiError(422, formatZodError(parsed.error));
  }

  const { code, data, msg } = parsed.data as ApiResponse<z.infer<T>>;
  if (code !== 0) throw new ApiError(code, msg);
  return data;
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "$";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
```

## [43] `lib/request/index.ts`

```ts
export { request } from "./client";
export {
  ApiError,
  codeToStatus,
  envelope,
  safeUnwrap,
  unwrap,
  type ApiResponse,
} from "./types";
```

---

## Features —— auth(必装)

## [44] `features/auth/actions.ts`

```ts
"use server";

import { cookies } from "next/headers";

import { siteConfig } from "@/config/site";
import { env } from "@/env";
import { request, safeUnwrap } from "@/lib/request";

import { Credentials, User } from "./schemas";
import type { User as UserType } from "./types";

function resolve(raw: string | undefined): string {
  if (!raw) return siteConfig.defaultRedirect;
  if (!raw.startsWith("/")) return siteConfig.defaultRedirect;

  if (raw.startsWith("//") || raw.startsWith("/\\")) {
    return siteConfig.defaultRedirect;
  }

  try {
    const parsed = new URL(raw, "http://_sentinel_/");
    if (parsed.host !== "_sentinel_") return siteConfig.defaultRedirect;
  } catch {
    return siteConfig.defaultRedirect;
  }
  return raw;
}

export async function setSession(input: unknown) {
  const { token, tenantCode } = Credentials.parse(input);

  const jar = await cookies();
  const isProd = process.env.NODE_ENV === "production";

  jar.set(env.COOKIE_TOKEN, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: env.COOKIE_TOKEN_MAX_AGE,
  });

  jar.set(env.COOKIE_TENANT_CODE, tenantCode, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: env.COOKIE_TOKEN_MAX_AGE,
  });

  const next = resolve(jar.get(env.COOKIE_CONTINUE)?.value);
  jar.delete(env.COOKIE_CONTINUE);

  return { next };
}

export async function getMe(): Promise<UserType> {
  return safeUnwrap(User, request("/web/um/sys/user/info"));
}
```

## [45] `features/auth/schemas.ts`

```ts
import { z } from "zod";

export const Credentials = z.object({
  token: z.string().min(20).max(4096),
  tenantCode: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export type Credentials = z.infer<typeof Credentials>;

export const Role = z.object({
  id: z.string(),
  name: z.string(),
});

export type Role = z.infer<typeof Role>;

export const User = z.object({
  id: z.string(),
  username: z.string(),
  realName: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  headUrl: z.string().nullable(),
  mobile: z.string().nullable(),
  jobTitle: z.string().nullable(),
  status: z.number(),
  superAdmin: z.union([z.literal(0), z.literal(1)]),
  superTenant: z.union([z.literal(0), z.literal(1)]),
  timezoneId: z.string(),
  timezoneName: z.string(),
  timezoneOffset: z.string(),
  timeFormat: z.string(),
  tenantId: z.string(),
  tenantCode: z.string(),
  tenantName: z.string(),
  shortName: z.string(),
  tenantType: z.number(),
  tenantPackage: z.string(),
  tenantTimezoneId: z.string(),
  tenantTimezoneName: z.string(),
  tenantTimezoneOffset: z.string(),
  roleList: z.array(Role).nullable(),
});

export type User = z.infer<typeof User>;
```

## [46] `features/auth/types.ts`

```ts
export type { Credentials, Role, User } from "./schemas";

export type Session = {
  token: string;
  tenantCode: string;
};
```

## [47] `features/auth/components/sso-callback.tsx`

```tsx
"use client";

import { useEffect, useRef } from "react";

import { siteConfig } from "@/config/site";

import { setSession } from "../actions";

export function SsoCallback() {
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    const raw = window.location.hash.slice(1);
    if (!raw) {
      window.location.replace(siteConfig.defaultRedirect);
      return;
    }

    const params = new URLSearchParams(raw);
    const token = params.get("token");
    const tenantCode = params.get("tenant_code");
    if (!token || !tenantCode) {
      window.location.replace(siteConfig.defaultRedirect);
      return;
    }

    setSession({ token, tenantCode })
      .then(({ next }) => {
        history.replaceState(null, "", window.location.pathname);
        window.location.replace(next);
      })
      .catch(() => window.location.replace(siteConfig.defaultRedirect));
  }, []);

  return null;
}
```

## [48] `features/auth/contexts/auth-context.tsx`

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useMemo, type ReactNode } from "react";

import { authQueries } from "../queries/options";
import type { User } from "../types";

export type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError, refetch } = useQuery({
    ...authQueries.me(),
    retry: (failureCount, error) => {
      if (failureCount >= 1) return false;
      const status =
        (error as { status?: number; statusCode?: number })?.status ??
        (error as { statusCode?: number })?.statusCode;
      return status !== 401;
    },
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data ?? null,
      isAuthenticated: !!data,
      isLoading,
      isError,
      refetch,
    }),
    [data, isLoading, isError, refetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

## [49] `features/auth/hooks/use-auth.ts`

```ts
"use client";

import { useContext } from "react";

import {
  AuthContext,
  type AuthContextValue,
} from "../contexts/auth-context";

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within <AuthProvider>");
  return context;
}
```

## [50] `features/auth/queries/keys.ts`

```ts
export const authKeys = {
  all: () => ["auth"] as const,
  me: () => [...authKeys.all(), "me"] as const,
};
```

## [51] `features/auth/queries/options.ts`

```ts
import { queryOptions } from "@tanstack/react-query";

import { getMe } from "../actions";
import { authKeys } from "./keys";

export const authQueries = {
  me: () =>
    queryOptions({
      queryKey: authKeys.me(),
      queryFn: getMe,
      staleTime: 5 * 60 * 1000,
    }),
};
```

## [52] `features/auth/server/session.ts`

```ts
import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { env } from "@/env";

import type { Session } from "../types";

export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const token = jar.get(env.COOKIE_TOKEN)?.value;
  const tenantCode = jar.get(env.COOKIE_TENANT_CODE)?.value;
  if (!token || !tenantCode) return null;
  return { token, tenantCode };
});

export async function getSessionHeaders(): Promise<Record<string, string>> {
  const session = await getSession();
  if (!session) return {};
  return {
    token: session.token,
    tenant_code: session.tenantCode,
  };
}
```

---

## Features —— notes(示例,可保留作样板或重命名为业务 feature)

## [53] `features/notes/actions.ts`

```ts
"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";

import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";

import { NoteId, NoteInput } from "./schemas";
import { getNoteCached, listNotesCached } from "./_cached";

export async function listNotes() {
  return listNotesCached();
}

export async function getNote(rawId: unknown) {
  const id = NoteId.parse(rawId);
  return getNoteCached(id);
}

export async function createNote(input: unknown) {
  const { title, content } = NoteInput.parse(input);

  const [row] = await db.insert(notes).values({ title, content }).returning();

  updateTag("notes:list");
  return row;
}

export async function updateNote(rawId: unknown, input: unknown) {
  const id = NoteId.parse(rawId);
  const { title, content } = NoteInput.parse(input);

  const [row] = await db
    .update(notes)
    .set({ title, content, updatedAt: new Date() })
    .where(eq(notes.id, id))
    .returning();

  if (!row) throw new Error("Note not found");

  updateTag("notes:list");
  updateTag(`notes:item:${id}`);
  return row;
}

export async function deleteNote(rawId: unknown) {
  const id = NoteId.parse(rawId);

  const [row] = await db
    .delete(notes)
    .where(eq(notes.id, id))
    .returning({ id: notes.id });

  if (!row) throw new Error("Note not found");

  updateTag("notes:list");
  updateTag(`notes:item:${id}`);
  return { id: row.id };
}
```

## [54] `features/notes/_cached.ts`

```ts
import "server-only";

import { desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";

export async function listNotesCached() {
  "use cache";
  cacheLife("hours");
  cacheTag("notes:list");

  return db.query.notes.findMany({
    orderBy: desc(notes.updatedAt),
    limit: 100,
  });
}

export async function getNoteCached(id: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(`notes:item:${id}`);

  const [row] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  return row ?? null;
}
```

## [55] `features/notes/schemas.ts`

```ts
import { z } from "zod";

export const NoteInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  content: z.string().trim().max(10_000),
});

export type NoteInput = z.infer<typeof NoteInput>;

export const NoteId = z.coerce.number().int().positive();
```

## [56] `features/notes/components/notes-table.tsx`

```tsx
"use client";

import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@openconsole/shadcn";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Note } from "@/lib/db/schema";

import { noteQueries } from "../queries/options";
import { NoteDeleteDialog } from "./note-delete-dialog";
import { NoteFormDialog } from "./note-form";

type NotesTableProps = {
  initialData: Note[];
};

export function NotesTable({ initialData }: NotesTableProps) {
  const { data: notes } = useSuspenseQuery({
    ...noteQueries.list(),
    initialData,
  });

  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Note | null>(null);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Notes</h2>
          <p className="text-muted-foreground text-sm">
            {notes.length} note{notes.length === 1 ? "" : "s"} in your list.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus />
          New note
        </Button>
      </div>

      {notes.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No notes yet</EmptyTitle>
            <EmptyDescription>
              Create your first note to get started.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setCreating(true)} variant="outline">
            <Plus />
            New note
          </Button>
        </Empty>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Content</TableHead>
                <TableHead className="hidden w-[180px] md:table-cell">
                  Updated
                </TableHead>
                <TableHead className="w-[110px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notes.map((note) => (
                <TableRow key={note.id}>
                  <TableCell className="font-medium">{note.title}</TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-[400px] truncate md:table-cell">
                    {note.content || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                    {new Date(note.updatedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(note)}
                        aria-label={`Edit ${note.title}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleting(note)}
                        aria-label={`Delete ${note.title}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <NoteFormDialog open={creating} onOpenChange={setCreating} />
      <NoteFormDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        note={editing}
      />
      <NoteDeleteDialog
        note={deleting}
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </>
  );
}
```

## [57] `features/notes/components/note-form.tsx`

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
} from "@openconsole/shadcn";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { Note } from "@/lib/db/schema";

import { createNote, updateNote } from "../actions";
import { noteKeys } from "../queries/keys";
import { NoteInput } from "../schemas";

type NoteFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note?: Note | null;
};

export function NoteFormDialog({
  open,
  onOpenChange,
  note,
}: NoteFormDialogProps) {
  const editing = !!note;
  const queryClient = useQueryClient();

  const form = useForm<NoteInput>({
    resolver: zodResolver(NoteInput),
    defaultValues: { title: "", content: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({ title: note?.title ?? "", content: note?.content ?? "" });
    }
  }, [open, note, form]);

  const mutation = useMutation({
    mutationFn: async (input: NoteInput) => {
      return editing ? updateNote(note!.id, input) : createNote(input);
    },
    onSuccess: (row) => {
      queryClient.setQueryData<Note[]>(noteKeys.list(), (old = []) => {
        if (!row) return old;
        if (editing) return old.map((n) => (n.id === row.id ? row : n));
        return [row, ...old];
      });
      if (editing && note) {
        queryClient.setQueryData(noteKeys.detail(note.id), row);
      }
      toast.success(editing ? "Note updated" : "Note created");
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save note");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit note" : "New note"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the title or content of this note."
              : "Add a new note to your list."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="note-form"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Untitled note"
                      autoFocus
                      maxLength={120}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Write something..."
                      rows={6}
                      maxLength={10_000}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="note-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? editing
                ? "Saving…"
                : "Creating…"
              : editing
                ? "Save changes"
                : "Create note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## [58] `features/notes/components/note-delete-dialog.tsx`

```tsx
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@openconsole/shadcn";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Note } from "@/lib/db/schema";

import { deleteNote } from "../actions";
import { noteKeys } from "../queries/keys";

type NoteDeleteDialogProps = {
  note: Note | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NoteDeleteDialog({
  note,
  open,
  onOpenChange,
}: NoteDeleteDialogProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (id: number) => deleteNote(id),
    onSuccess: ({ id }) => {
      queryClient.setQueryData<Note[]>(noteKeys.list(), (old = []) =>
        old.filter((n) => n.id !== id),
      );
      queryClient.removeQueries({ queryKey: noteKeys.detail(id) });
      toast.success("Note deleted");
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this note?</AlertDialogTitle>
          <AlertDialogDescription>
            {note?.title
              ? `"${note.title}" will be permanently removed.`
              : "This note will be permanently removed."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              if (note) mutation.mutate(note.id);
            }}
            disabled={mutation.isPending || !note}
          >
            {mutation.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

## [59] `features/notes/queries/keys.ts`

```ts
export const noteKeys = {
  all: () => ["notes"] as const,
  list: () => [...noteKeys.all(), "list"] as const,
  detail: (id: number) => [...noteKeys.all(), "detail", id] as const,
};
```

## [60] `features/notes/queries/options.ts`

```ts
import { queryOptions } from "@tanstack/react-query";

import { getNote, listNotes } from "../actions";
import { noteKeys } from "./keys";

export const noteQueries = {
  list: () =>
    queryOptions({
      queryKey: noteKeys.list(),
      queryFn: () => listNotes(),
      staleTime: 30 * 1000,
    }),
  detail: (id: number) =>
    queryOptions({
      queryKey: noteKeys.detail(id),
      queryFn: () => getNote(id),
      staleTime: 30 * 1000,
    }),
};
```

---

## 其余文件

## [61] `contexts/.gitkeep`

空文件。占位:`contexts/` 目录用来存跨 feature 的全局 Context,默认是空的。

## [62] `drizzle/0000_initial.sql`

```sql
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

## [63] `drizzle/meta/_journal.json`

```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    {
      "idx": 0,
      "version": "7",
      "when": <CURRENT_TIMESTAMP_MS>,
      "tag": "0000_initial",
      "breakpoints": true
    }
  ]
}
```

> 实际生成时用 `pnpm db:generate` 让 drizzle-kit 自动管理。本文件只是首次模板提交。

## [64] `drizzle/meta/0000_snapshot.json`

> 由 drizzle-kit 生成,内容较长。**做法**:不要手写,跑 `pnpm db:generate` 让工具基于
> 当前 `lib/db/schema/*.ts` 自动产生(同时会生成 `0000_<random>.sql` 与
> `_journal.json`)。提交进 git。

## [65] `docker/docker-compose.yaml`

> 起本地 pgbouncer + nacos。`container_name` 用项目名作前缀避免多项目冲突。

```yaml
# 启动:  docker compose -f docker/docker-compose.yaml up -d
# 停止:  docker compose -f docker/docker-compose.yaml down
# 日志:  docker compose -f docker/docker-compose.yaml logs -f

services:
  pgbouncer:
    image: edoburu/pgbouncer:v1.25.1-p0
    container_name: <PROJECT_NAME>-pgbouncer
    restart: unless-stopped
    ports:
      - "6432:6432"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      DB_HOST: host.docker.internal
      DB_PORT: 5432
      DB_USER: postgres
      DB_PASSWORD: 123456
      DB_NAME: postgres
      LISTEN_PORT: 6432
      POOL_MODE: transaction
      AUTH_TYPE: scram-sha-256
      MAX_CLIENT_CONN: 1000
      DEFAULT_POOL_SIZE: 25
      MAX_DB_CONNECTIONS: 50
      IGNORE_STARTUP_PARAMETERS: extra_float_digits,application_name

  nacos:
    image: nacos/nacos-server:v2.3.2-slim
    container_name: <PROJECT_NAME>-nacos
    restart: unless-stopped
    environment:
      MODE: standalone
      NACOS_AUTH_ENABLE: "true"
      NACOS_AUTH_IDENTITY_KEY: nacos
      NACOS_AUTH_IDENTITY_VALUE: nacos
      NACOS_AUTH_TOKEN: SecretKey012345678901234567890123456789012345678901234567890123456789
      JVM_XMS: 512m
      JVM_XMX: 512m
    ports:
      - "8848:8848"
      - "9848:9848"
    volumes:
      - nacos-data:/home/nacos/data
      - nacos-logs:/home/nacos/logs

volumes:
  nacos-data:
  nacos-logs:
```

## [66] `public/favicon.png`

二进制文件,放任意 32×32 png 即可(浏览器 tab 图标)。

## [67] `public/loading.json`

`app/loading.tsx` 用的 Lottie 动画源文件(可选)。从 [LottieFiles](https://lottiefiles.com/free-animations/loading) 下载任意符合品牌色的 Lottie JSON 放进 `public/` 即可,文件名要与 `app/loading.tsx` 里的 `src="/loading.json"` 对齐。不想用 Lottie 也可以把 `app/loading.tsx` 改成静态 `<Skeleton>` 屏。

---

## 完成后验证

```bash
# 1. 装包
pnpm install

# 2. 起本地依赖
docker compose -f docker/docker-compose.yaml up -d

# 3. 数据库迁移
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
