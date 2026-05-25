# 核心文件代码

## lib/auth/cookies.ts

```ts
// proxy.ts、lib/auth/session.ts、lib/auth/authenticate.ts 共用的 cookie 名。
// 纯常量——edge runtime 也能安全 import。

export const TOKEN_COOKIE = "token";
export const TENANT_COOKIE = "tenant_code";

/** 保存用户跳去 SSO 之前原本想访问的 URL。 */
export const CONTINUE_COOKIE = "continue";

export const TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 天
export const CONTINUE_MAX_AGE = 60 * 5; // 5 分钟
```

## lib/auth/session.ts

```ts
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";

import { TOKEN_COOKIE, TENANT_COOKIE } from "./cookies";

export type Session = {
  token: string;
  tenantCode?: string;
};

/** 权威的 session 读取。`cache()` 在单次 RSC 请求里去重。 */
export const auth = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const token = jar.get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  return { token, tenantCode: jar.get(TENANT_COOKIE)?.value };
});

/** 调外部 API 时拼的 `Authorization: Bearer …` header。没 session 返回空对象。 */
export async function bearer(): Promise<Record<string, string>> {
  const session = await auth();
  return session ? { authorization: `Bearer ${session.token}` } : {};
}
```

## lib/auth/guards.ts

```ts
import "server-only";
import { redirect } from "next/navigation";
import { auth, type Session } from "./session";

/**
 * 任何动用户数据的 Server Action / RSC 都要在第一行调这个。
 * Server Action 通过 RPC 调，绕过 proxy.ts，所以这里要再校验一次。
 */
export async function protect(): Promise<Session> {
  const session = await auth();
  if (!session) redirect("/");
  return session;
}
```

## lib/auth/authenticate.ts

```ts
"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import {
  CONTINUE_COOKIE,
  TENANT_COOKIE,
  TOKEN_COOKIE,
  TOKEN_MAX_AGE,
} from "./cookies";

/**
 * <Callback /> 从 URL hash 解出 token + tenant_code 后通过 RPC 转给本 Action，
 * 由它写 cookie 落地。
 */

const Schema = z.object({
  token: z.string().min(1).max(4096),
  // 正则防 CRLF / 其它 cookie 注入 payload
  tenantCode: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export async function authenticate(input: z.input<typeof Schema>) {
  const { token, tenantCode } = Schema.parse(input);

  const jar = await cookies();
  const isProd = process.env.NODE_ENV === "production";

  // Session token —— httpOnly，XSS 读不到。
  jar.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_MAX_AGE,
  });

  // tenant_code —— 客户端 JS 可读（UI 可能需要）。
  jar.set(TENANT_COOKIE, tenantCode, {
    httpOnly: false,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_MAX_AGE,
  });

  // 读出并消费掉 proxy.ts 在 SSO 前埋下的 `continue` cookie。
  const next = resolve(jar.get(CONTINUE_COOKIE)?.value);
  jar.delete(CONTINUE_COOKIE);

  return { next };
}

/** 把原始 continue 值解析为安全的内部 URL；非法时退回 /dashboard。 */
function resolve(raw: string | undefined): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard"; // protocol-relative URL
  return raw;
}
```

## features/auth/components/callback.tsx

```tsx
"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { authenticate } from "@/lib/auth/authenticate";

/**
 * SSO 回调处理器 —— 挂载在 `app/page.tsx`。
 * 从 `window.location.hash` 读 token + tenant_code，转发给 `authenticate`，
 * 然后做整页导航跳走。
 */
export function Callback() {
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const raw = window.location.hash.slice(1);
    if (!raw) {
      window.location.replace("/dashboard");
      return;
    }

    const params = new URLSearchParams(raw);
    const token = params.get("token");
    const tenantCode = params.get("tenant_code");
    if (!token || !tenantCode) {
      window.location.replace("/dashboard");
      return;
    }

    // 把 fragment 从 URL 里抹掉 —— token 不能留在地址栏。
    history.replaceState(null, "", window.location.pathname);

    authenticate({ token, tenantCode })
      .then(({ next }) => window.location.replace(next))
      .catch((err) => {
        console.error("[auth-callback]", err);
        toast.error("登录失败，请重试");
        window.location.replace("/dashboard");
      });
  }, []);

  return null;
}
```

## features/auth/index.ts

```ts
// Barrel —— 仅导出 UI。Server Action 直接从 @/lib/auth/* 引入。

export { Callback } from "./components/callback";
```

## proxy.ts

```ts
import { NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import {
  CONTINUE_COOKIE,
  CONTINUE_MAX_AGE,
  TOKEN_COOKIE,
} from "@/lib/auth/cookies";

// 让未鉴权请求能到达 `/`，<Callback /> 才能从 URL fragment 里取 SSO token。
const PUBLIC_PATHS = ["/"];

/**
 * Edge 网关 —— 只做 cookie 存在性检查。真正的校验在 lib/auth/guards.ts。
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (request.cookies.has(TOKEN_COOKIE)) return NextResponse.next();

  // 手动 encode redirect_uri，避免 URL 里的 `&`/`=` 把 fragment 参数截断。
  const fragment = `redirect_uri=${encodeURIComponent(env.NEXT_PUBLIC_APP_URL)}&source=sso`;
  const loginUrl = new URL("/login", env.NEXT_PUBLIC_AUTH_URL);
  loginUrl.hash = fragment;

  const response = NextResponse.redirect(loginUrl);

  // 只有顶层用户导航时才记住 URL。后台探测不能污染 continue cookie。
  if (request.headers.get("sec-fetch-dest") === "document") {
    response.cookies.set(CONTINUE_COOKIE, pathname + search, {
      maxAge: CONTINUE_MAX_AGE,
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
    // 排除框架资源和约定的探测路径
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

## .env.example

```
NEXT_PUBLIC_AUTH_URL=https://your-idp.example.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## env.ts

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {},
  client: {
    /** IdP base URL。proxy.ts 会拼上 `/login` 和 fragment 里的 redirect_uri。 */
    NEXT_PUBLIC_AUTH_URL: z.url(),

    /**
     * 本应用对外暴露的 canonical origin。作为发给 IdP 的 SSO redirect_uri，
     * 必须跟 IdP 白名单逐字符匹配。
     */
    NEXT_PUBLIC_APP_URL: z.url(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
```
