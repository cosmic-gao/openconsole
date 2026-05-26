# Auth Flow —— 外部登录回调完整链路

> 统一骨架的鉴权完全 cookie-based,无需 NextAuth / Clerk 等库。token 由外部登录页颁发,
> 骨架只负责接 callback、写 cookie、读 session。链路固定,不要自创实现。

---

## 全景图

```
┌──────────────────────────────────────────────────────────────────────────┐
│  浏览器                                                                   │
│  ① 访问 https://app.example.com/dashboard                                │
└──────────────────────┬───────────────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  proxy.ts (Next 16 middleware)                                            │
│  ② 检查 cookies.has("token")                                              │
│  ③ 没有 → 写 cookies.continue = "/dashboard"                              │
│           → 302 跳 SSO:                                                   │
│               $NEXT_PUBLIC_AUTH_URL/login                                  │
│               #redirect_uri=$NEXT_PUBLIC_APP_URL&source=sso                │
└──────────────────────┬───────────────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  SSO 站(外部)                                                            │
│  ④ 用户登录                                                                │
│  ⑤ 重定向回 $NEXT_PUBLIC_APP_URL/#token=eyJ...&tenant_code=acme            │
└──────────────────────┬───────────────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  浏览器(回到本站)                                                        │
│  ⑥ 命中 app/page.tsx → 渲染 <SsoCallback />(无界面)                       │
└──────────────────────┬───────────────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  <SsoCallback /> (client)                                                 │
│  ⑦ useEffect 跑一次                                                        │
│  ⑧ 解析 window.location.hash → {token, tenant_code}                       │
│  ⑨ 调 setSession({token, tenantCode}) Server Action                       │
└──────────────────────┬───────────────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  setSession (server action)                                                │
│  ⑩ zod 校验入参                                                            │
│  ⑪ cookies().set(token / tenant_code, httpOnly + secure)                  │
│  ⑫ 读 cookies.continue —— 在 resolve() 里防开放重定向                      │
│  ⑬ cookies().delete(continue)                                              │
│  ⑭ return { next }                                                         │
└──────────────────────┬───────────────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  <SsoCallback />                                                          │
│  ⑮ history.replaceState 清掉 URL 上的 hash(避免 token 留在 history)      │
│  ⑯ window.location.replace(next)                                          │
│        —— 全页面刷新,带新 cookie                                          │
└──────────────────────┬───────────────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  浏览器再次访问 /dashboard(带上新 cookie)                                │
│  ⑰ proxy.ts 看到 token → 放行                                              │
│  ⑱ app/(dashboard)/layout.tsx 渲染 <AuthProvider>                          │
│  ⑲ <AuthProvider> 通过 TanStack Query 调 getMe() 拉用户信息              │
│  ⑳ 业务页面渲染                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 涉及的所有文件

| 文件 | 角色 |
| --- | --- |
| `proxy.ts` | middleware,守门员 |
| `app/page.tsx` | callback 落点 |
| `features/auth/components/sso-callback.tsx` | client 组件,处理 hash → server action |
| `features/auth/actions.ts` | `setSession` server action 写 cookie |
| `features/auth/schemas.ts` | zod 校验 |
| `features/auth/server/session.ts` | `getSession()` / `getSessionHeaders()` 服务端读 cookie |
| `features/auth/contexts/auth-context.tsx` | `<AuthProvider>` —— client 端通过 TanStack Query 拉 `getMe()` |
| `features/auth/hooks/use-auth.ts` | `useAuth()` —— 业务组件读 user |
| `features/auth/queries/{keys,options}.ts` | TanStack Query 的 key 工厂与 options |
| `features/auth/types.ts` | `Session` 类型 |
| `lib/request/client.ts` | `ofetch` 客户端,`onRequest` 自动注入 session 头 |
| `env.ts` | `COOKIE_TOKEN` / `COOKIE_TENANT_CODE` / `COOKIE_CONTINUE` 名 |
| `config/site.ts` | `defaultRedirect` —— 没有 continue 时跳哪 |

---

## 关键代码读法

### `proxy.ts`(每行说什么)

```ts
const hasToken = request.cookies.has(env.COOKIE_TOKEN);

// 已登录回首页 → 直接跳 dashboard,省一次 callback
if (pathname === "/" && hasToken) return redirect(defaultRedirect);

// 公开路径(`/`)放行
if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next(...);

// 已登录访问受保护页面 → 放行
if (hasToken) return NextResponse.next(...);

// 未登录访问受保护页面:
// 1. 拼 SSO 登录 URL,把 redirect_uri 放 hash 里(传给 SSO)
const fragment = `redirect_uri=${encodeURIComponent(env.NEXT_PUBLIC_APP_URL)}&source=sso`;
const loginUrl = new URL("/login", env.NEXT_PUBLIC_AUTH_URL);
loginUrl.hash = fragment;

// 2. 把原路径写进 continue cookie,登录后用得上
if (request.headers.get("sec-fetch-dest") === "document") {
  response.cookies.set(env.COOKIE_CONTINUE, pathname + search, {
    maxAge: env.COOKIE_CONTINUE_MAX_AGE,    // 5 min 默认
    httpOnly: true,
    sameSite: "lax",
  });
}

return response;
```

### `setSession`(Server Action)

```ts
export async function setSession(input: unknown) {
  const { token, tenantCode } = Credentials.parse(input);  // zod 校验

  const jar = await cookies();
  jar.set(env.COOKIE_TOKEN, token, { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: MAX_AGE });
  jar.set(env.COOKIE_TENANT_CODE, tenantCode, { ...同上... });

  // resolve() 函数防 open redirect:
  // - 必须以 / 开头
  // - 不能以 // 或 /\\ 开头(scheme-relative URL)
  // - URL 解析后 host 必须是 sentinel
  // 任何可疑值都回退到 defaultRedirect
  const next = resolve(jar.get(env.COOKIE_CONTINUE)?.value);
  jar.delete(env.COOKIE_CONTINUE);

  return { next };
}
```

### `getSession`(读 session)

```ts
import "server-only";
import { cache } from "react";

export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const token = jar.get(env.COOKIE_TOKEN)?.value;
  const tenantCode = jar.get(env.COOKIE_TENANT_CODE)?.value;
  if (!token || !tenantCode) return null;
  return { token, tenantCode };
});
```

`React.cache()` 让同一 RSC 请求里多次调用只读一次 cookie。

### `getSessionHeaders`(给 BFF 调用注入)

```ts
export async function getSessionHeaders(): Promise<Record<string, string>> {
  const session = await getSession();
  if (!session) return {};
  return {
    token: session.token,
    tenant_code: session.tenantCode,
  };
}
```

`lib/request/client.ts` 的 `onRequest` 钩子自动注入这两个头给所有 BFF 调用。

### `<AuthProvider>`(client 端拿用户信息)

```tsx
"use client";
const { data, isLoading } = useQuery({
  ...authQueries.me(),                  // queryFn = getMe (server action)
  retry: (failureCount, error) => {
    if (failureCount >= 1) return false;
    // 401 不重试 —— 让上层导出登录页
    const status = error.status ?? error.statusCode;
    return status !== 401;
  },
});
```

### `useAuth()`

```tsx
"use client";
const { user, isAuthenticated, isLoading, isError, refetch } = useAuth();
```

业务组件直接用,**不要**自己再写一遍。

---

## 在 Server Action / Route Handler 里鉴权

### 方案 1:守卫函数(推荐)

```ts
// features/<domain>/actions.ts
"use server";

import { unauthorized } from "next/navigation";
import { getSession } from "@/features/auth/server/session";

export async function createOrder(input: unknown) {
  const session = await getSession();
  if (!session) unauthorized();   // 触发 app/unauthorized.tsx

  // …业务
}
```

`unauthorized()` 函数需要 `next.config.ts` 的 `experimental.authInterrupts: true`(模板已开)。

### 方案 2:封装 protect helper(如果跨多个 action 复用)

```ts
// features/auth/server/guard.ts
import "server-only";
import { unauthorized } from "next/navigation";
import { getSession } from "./session";

export async function protect() {
  const session = await getSession();
  if (!session) unauthorized();
  return session;
}
```

```ts
// features/orders/actions.ts
"use server";
import { protect } from "@/features/auth/server/guard";

export async function createOrder(input: unknown) {
  await protect();
  // …
}
```

骨架里**没有**预置 protect()(`features/notes` 示范 feature 当前没鉴权,直接调 `getSession`),需要时按以上模式加进 `features/auth/server/guard.ts`。

---

## 在 RSC 里读用户

### 方案 1:服务端直接调

```tsx
// app/(dashboard)/dashboard/page.tsx
import { getSession } from "@/features/auth/server/session";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    // 走 proxy.ts 跳 SSO,这里几乎不会进
    return null;
  }
  // …
}
```

### 方案 2:让 `<AuthProvider>` 拿(client 端)

```tsx
// app/(dashboard)/dashboard/page.tsx
"use client";
import { useAuth } from "@/features/auth/hooks/use-auth";

export default function DashboardPage() {
  const { user } = useAuth();
  // user 来自 TanStack Query 缓存,首次会 loading
}
```

骨架的 `/dashboard/page.tsx` 用的是方案 2。

---

## 跳转环境变量

| 变量 | 示例值 | 含义 |
| --- | --- | --- |
| `NEXT_PUBLIC_AUTH_URL` | `https://login.example.com` | 外部登录站根 URL |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` / `https://app.example.com` | 本应用根 URL(登录站跳回的目标) |
| `COOKIE_TOKEN` | 默认 `token` | token cookie 名 |
| `COOKIE_TENANT_CODE` | 默认 `tenant_code` | tenant cookie 名 |
| `COOKIE_CONTINUE` | 默认 `continue` | 原路径暂存 cookie 名 |
| `COOKIE_TOKEN_MAX_AGE` | 默认 30 天 | token cookie 有效期 |
| `COOKIE_CONTINUE_MAX_AGE` | 默认 5 分钟 | continue cookie 有效期(登录回来的窗口) |

---

## 安全考虑(已经处理好,**不要破坏**)

| 风险 | 骨架的防御 |
| --- | --- |
| Open redirect | `resolve()` 函数检查 continue cookie:必须 `/` 开头、不能是 scheme-relative、URL 解析 host 必须是 sentinel,可疑就回退 |
| XSS 窃取 token | cookie 是 `httpOnly` —— JS 读不到 |
| CSRF | cookie 是 `SameSite: lax` —— 跨站请求不带 cookie |
| token 留在 history / Referer | callback 完成立刻 `history.replaceState(null, "", pathname)` 清掉 hash |
| 同一请求里多次读 cookie | `getSession` 用 `React.cache()` 去重 |
| 服务端代码混进 client bundle | `session.ts` 第一行 `import "server-only"` |
| 登录站故障 / 网络挂 | TanStack Query 的 retry policy —— 401 不重试,其它 1 次 |

---

## 怎么扩展

### 加 RBAC(角色权限)

`features/auth/schemas.ts` 已有 `roleList`,在 Server Action 里检查:

```ts
"use server";
import { forbidden } from "next/navigation";
import { getMe } from "@/features/auth/actions";

export async function deleteOrder(id: number) {
  const me = await getMe();
  if (!me.roleList?.some(r => r.name === "admin")) forbidden();
  // …
}
```

`forbidden()` 触发 `app/forbidden.tsx`,需要 `experimental.authInterrupts: true`。

### 加 logout

```ts
// features/auth/actions.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/env";

export async function logout() {
  const jar = await cookies();
  jar.delete(env.COOKIE_TOKEN);
  jar.delete(env.COOKIE_TENANT_CODE);
  redirect("/");
}
```

client 触发:

```tsx
<Button onClick={() => logout()}>Sign out</Button>
```

---

## 禁止

- ❌ 自己实现 `getServerSession()` / `useSession()`
- ❌ 直接 `cookies().get("token")` —— 永远用 `getSession()`
- ❌ 写自己的 BFF 请求 wrapper —— 用 `lib/request/` 的 `request`
- ❌ 在 Server Action 里跳过 session 检查就操作数据 —— 必须 `getSession() / protect()`
- ❌ `router.replace(next)` 代替 `window.location.replace(next)` —— 刚写 cookie 必须全页刷新(否则同进程的 React tree 拿不到新 cookie 状态)
- ❌ 改 `proxy.ts` 文件名 —— Next 16 约定就是 `proxy.ts`

---

## 跨 skill

- 全局架构(目录约定、技术栈、五条硬规则):查 [`../../AGENTS.md`](../../AGENTS.md)
- 通用 Next 写法(Server Action 三件套、Cache Components、错误页):查 [`nextjs-best-practices`](../../nextjs-best-practices/SKILL.md)
- TanStack Query 怎么用(retry / key 设计):查 [`tanstack-query`](../../tanstack-query/SKILL.md)
- UI 错误页(`Unauthorized` / `Forbidden`):查 [`ui`](../../ui/SKILL.md)
