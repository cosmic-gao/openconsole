---
name: nextjs-auth-callback
description: |
  公司内部 Next.js 项目的外部登录回调集成,自包含完整规范。外部登录页用 URL fragment 把 token 送回应用,应用通过 Server Action 写 httpOnly cookie 建立本地登录态,并在登录前 / 登录后保留用户原本想去的路径。本 skill 描述的是**统一骨架已经预置**的鉴权链(`proxy.ts` → 外部登录页 → `/#token=...` → `<SsoCallback />` → `setSession` → `window.location.replace(next)`),agent 的工作是**接入 / 扩展 / 排错**,不是另写一套。

  必须在以下场景触发,即使用户没说出 skill 名:加登录 / 接 SSO / 接登录回调 / 接 token 回调 / auth callback / 未登录跳转 / 受保护路由 / protected routes / proxy.ts 鉴权 / `setSession` server action / `getSession()` / `getSessionHeaders()` / `<SsoCallback />` / `<AuthProvider>` / `useAuth()` / `unauthorized()` / `forbidden()` / 登录守卫 / `protect()` helper / continue cookie / 登录后跳回原路径 / open redirect 防御 / RBAC 角色 / `roleList` / logout / 注销 / 退出登录 / cookie token 过期 / 401 不重试。

  全局架构约束见同目录 `AGENTS.md`;通用 Next 写法走 `nextjs-best-practices` skill;UI 错误页(`Unauthorized` / `Forbidden`)走 `ui` skill。
---

# Next.js 16 外部登录回调

外部登录页通过 URL fragment 把 token 送回应用，应用接住后写 httpOnly cookie 建立本地登录态，并保留用户登录前想去的 URL。

## 这是什么,不是什么

| 你以为的 | 实际是 |
| --- | --- |
| Single Sign-On (SSO) | 不是。本 skill 只覆盖「单个应用怎么接住外部登录给的 token」 |
| OAuth code flow | 不是。本 skill 是前端 SPA 直接把 token 用 URL fragment 送过来 |
| OIDC | 不是。本 skill 不假设 token 格式 |

## 适用场景

- 外部登录页是 SPA,用 `window.location.href = "<app>#token=…&tenant_code=…"` 跳回
- Token 必须存进 `httpOnly` cookie
- Token 不能出现在 server access log / Referer header / 用户分享的链接里

## 核心机制(三件事缺一不可)

| 机制 | 作用 |
| --- | --- |
| `proxy.ts` 在 302 前写 `continue` cookie | URL fragment 无法跨登录页传递「原始路径」,cookie 能跨整段登录跳转保留 |
| `Sec-Fetch-Dest: document` 检查 | 后台探测(`.well-known` / source map 等)不会污染 `continue` cookie |
| `window.location.replace` | 刚写好的 cookie 需要走完整页面导航才能稳带 —— `router.replace` 会撞「Failed to fetch RSC payload」 |

完整链路图与文件级实现见 [`references/auth-flow.md`](./references/auth-flow.md)。

---

## 接入流程

### 步骤 1:问用户两个 URL

```jsonc
{
  "questions": [
    { "question": "登录页面的网址是什么?", "header": "登录地址" },
    { "question": "你当前应用部署在哪里?", "header": "应用地址" }
  ]
}
```

写入 `.env.local`:

```env
NEXT_PUBLIC_AUTH_URL=<问题 1 的答案>
NEXT_PUBLIC_APP_URL=<问题 2 的答案>
```

### 步骤 2:确认骨架文件已就绪

骨架(由 `nextjs-best-practices` 的 `scaffold.md` 生成)预置如下文件,鉴权链已闭环可用 —— 一般无需新建,只需要按下面的「核心代码」核对:

| 文件 | 角色 |
| --- | --- |
| `proxy.ts` | Edge 网关,守门员 |
| `app/page.tsx` | callback 落点,渲染 `<SsoCallback />` |
| `features/auth/components/sso-callback.tsx` | 客户端组件,读 hash → 调 Server Action |
| `features/auth/actions.ts` | `setSession` + `getMe` Server Actions |
| `features/auth/schemas.ts` | zod 校验 `Credentials` + `User` |
| `features/auth/server/session.ts` | `getSession()` + `getSessionHeaders()` |
| `features/auth/contexts/auth-context.tsx` | `<AuthProvider>`,TanStack Query 拉 `getMe` |
| `features/auth/hooks/use-auth.ts` | `useAuth()` 业务消费 |
| `features/auth/queries/{keys,options}.ts` | TanStack Query 工厂 |
| `features/auth/types.ts` | `Session` 类型 |
| `lib/request/client.ts` | `ofetch` + `onRequest` 自动注入 session 头 |
| `env.ts` | `COOKIE_TOKEN` / `COOKIE_TENANT_CODE` / `COOKIE_CONTINUE` 名 |
| `config/site.ts` | `defaultRedirect` |

### 步骤 3:接入验收

- [ ] 访问受保护路径(如 `/dashboard`)→ 302 跳到 `NEXT_PUBLIC_AUTH_URL/login`
- [ ] 手动构造 `#token=<≥20 字符>&tenant_code=<demo>` 到 `/`,cookie 被写、跳回 `/dashboard`
- [ ] cookies 在浏览器看到 `token` / `tenant_code`,且 `token` 是 `HttpOnly`
- [ ] dashboard 上 `useAuth()` 拿到当前用户信息

---

## 核心代码模式(骨架已经实现,改之前先读这里)

### `setSession` Server Action 写 Cookie

```ts
// features/auth/actions.ts
"use server";

import { cookies } from "next/headers";

import { siteConfig } from "@/config/site";
import { env } from "@/env";
import { request, safeUnwrap } from "@/lib/request";

import { Credentials, User } from "./schemas";

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

export async function getMe() {
  return safeUnwrap(User, request("/web/um/sys/user/info"));
}
```

### `proxy.ts` Edge 网关

```ts
import { type NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { env } from "@/env";

const PUBLIC_PATHS = ["/"];
const REQUEST_ID_HEADER = "x-request-id";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasToken = request.cookies.has(env.COOKIE_TOKEN);

  const requestId = request.headers.get(REQUEST_ID_HEADER) || crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  if (pathname === "/" && hasToken) {
    const redirect = NextResponse.redirect(new URL(siteConfig.defaultRedirect, request.url));
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

### `<SsoCallback />` 客户端组件

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

### `getSession()` / `getSessionHeaders()` 服务端读

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
  return { token: session.token, tenant_code: session.tenantCode };
}
```

完整端到端链路图、RBAC 扩展、logout 扩展、安全防御汇总,详见 [`references/auth-flow.md`](./references/auth-flow.md)。

---

## 安全措施

详见 [`references/security.md`](./references/security.md)。

已实现:`httpOnly` cookie、`Secure` flag、`SameSite: lax`、token 长度限制、tenant_code 正则校验、`resolve()` 拒绝外部 URL、`Sec-Fetch-Dest` 守卫 continue cookie、`history.replaceState` 清掉地址栏 hash、Server Action 入参 zod 校验。

未实现:CSRF `state` 参数(登录服务支持时加)、Token 签名验证(收到 JWT 时加)。

---

## 详细参考

- [`references/auth-flow.md`](./references/auth-flow.md) —— 完整端到端链路(`proxy.ts` → 外部登录页 → `<SsoCallback />` → `setSession` → 跳转),含 RBAC / logout 扩展、安全防御汇总、SSO 跳转 env 变量
- [`references/security.md`](./references/security.md) —— 安全检查清单
