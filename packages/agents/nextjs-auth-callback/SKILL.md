---
name: nextjs-auth-callback
description: |
  Next.js 16 外部登录回调集成：外部登录页用 URL fragment 把 token 送回应用，应用读取后通过 Server Action 写 httpOnly cookie 建立本地登录态，并保留用户登录前想去的 URL。无论用户怎么描述——"需要登录"、"加用户授权"、"加登录功能"、"我要做用户登录"、"用户怎么登录"、"未登录跳转登录页"、"加鉴权"、"接 SSO"、"集成外部登录"、"接住登录回跳"、"做个登录流程"、"加 auth"、"加 protected routes"、SSO 登录、外部登录、登录跳转回来、token 回调、auth callback handler、fragment-based auth、protected routes、proxy.ts 鉴权、Next.js 中间件鉴权、登录完回到原页面——只要意图涉及"让本应用支持登录态、拦截未登录访问、接住外部登录页返回的 token"都触发此 skill（即使用户错称为"SSO 登录"，本 skill 仅覆盖单应用的回调集成，不是真正的多应用 SSO 协议；但实际需求多半是这个）。**当 `nextjs-scaffold` 刚搭完骨架、用户选择"装登录回调"时也会被它自动调用**。本 skill 不重复 `nextjs-scaffold`（搭骨架）或 `nextjs-best-practices`（写代码）的内容。
---

# Next.js 16 外部登录回调（Fragment 版）

一套可直接拷贝的"集成外部登录服务"的实现：用户输入 `app.com/note` → 没有 token → 被踢去外部登录页 → 登录成功 → 跳回 `/note`（不是 `/dashboard`）。客户端提取 fragment 里的 token、Server Action 写 httpOnly cookie、`continue` cookie 保留原始 URL。

**所有要创建的文件内容都内联在本文件下方**——agent 按 "## 文件清单" 一节里给出的路径 + 代码片段直接 Write 创建（合并到现有文件的情况见 "## 安装"）。

## 这是什么，不是什么

**是**：单个 Next.js 应用集成外部登录服务的**回调处理**——外部登录页通过 URL fragment 把 token 送回来，本应用接住并存进 cookie。

**不是**：

| 你以为的 | 实际是 |
| --- | --- |
| Single Sign-On (SSO) | 不是。SSO 是"一次登录、多应用共享会话"，需要跨应用的 session 设施。本 skill 只覆盖"我这一个 app 怎么接住外部登录给的 token"。如果你有多个应用共用同一个登录页，那个登录页本身才是 SSO 提供者；本 skill 只负责其中一个 app 的接收端。 |
| OAuth code flow | 不是。code flow 是后端拿 `code` 去后端换 token；本 skill 是前端 SPA 直接把 token 用 URL fragment 送过来（类似 OAuth implicit flow 但简化版）。 |
| OIDC | 不是。OIDC 是基于 OAuth 的身份层，定义了 `id_token` 等。本 skill 不假设 token 格式。 |

## 适用 / 不适用

✓ 外部登录页是 SPA / 纯前端实现，用 `window.location.href = "<app>#token=…"` 跳回
✓ Token 必须存进 `httpOnly` cookie（防 XSS）
✓ Token 不能出现在 server access log / Referer header / 用户分享的链接里

| 不适用 | 应该用 |
| --- | --- |
| 真 SSO（多应用共享会话、统一登出） | 完整的 SSO 协议（SAML / OIDC + session sharing） |
| OAuth authorization-code flow（后端换 token） | NextAuth.js / Auth.js |
| 需要自动刷新 token / 滑动会话 | 带 refresh_token 机制的库（Better Auth、Clerk） |
| 纯 SPA 没有后端 session | 客户端 `localStorage` 够用了 |
| 登录页用服务端 302 把 token 放 query string | 不适用——本 skill 用 fragment，query 模式需要别的处理 |

---

## 配置（实施前问用户）

用 AskUserQuestion 问用户两个网址。**面向用户的话术保持口语化**——避免出现 "base URL"、"canonical"、"redirect_uri"、"NEXT_PUBLIC_*"、"scheme"、"白名单逐字符匹配" 这种工程术语，因为本 skill 的用户可能是非工程师。

```jsonc
{
  "questions": [
    {
      "question": "登录页面的网址是什么？没登录的用户会被自动跳过去登录。",
      "header": "登录地址",
      "options": [
        { "label": "https://app.mspbots.ai", "description": "示例：换成你的登录系统地址" },
        { "label": "https://appstg.mspbots.ai", "description": "示例：测试环境的登录地址" }
      ],
      "multiSelect": false
    },
    {
      "question": "你当前应用部署在哪里？登录完成后会跳回到这里。",
      "header": "应用地址",
      "options": [
        { "label": "http://localhost:3000", "description": "本地开发（在自己电脑上调试）" },
        { "label": "https://app.example.com", "description": "线上正式部署（换成你的实际域名）" }
      ],
      "multiSelect": false
    }
  ]
}
```

拿到答案后写入 `.env.local`：

```env
NEXT_PUBLIC_AUTH_URL=<问题 1 的答案>
NEXT_PUBLIC_APP_URL=<问题 2 的答案>
```

> ⚠️ **AI 实施时的内部约束**（不要写进给用户看的问题里）：`NEXT_PUBLIC_APP_URL` 要和登录服务白名单里的地址逐字符一致（scheme、port、末尾斜杠都不能差）；不能用 `request.nextUrl.origin` 推断（反向代理后 Host 头不可信）。

### 可调参数（按需手动改）

| 参数 | 位置 | 默认值 | 何时改 |
| --- | --- | --- | --- |
| Token cookie 名 | `lib/auth/cookies.ts` `TOKEN_COOKIE` | `"token"` | 后端要求特定名字 |
| Token 有效期 | `TOKEN_MAX_AGE` | 30 天 | 匹配真实会话时长 |
| 公开路径白名单 | `proxy.ts` `PUBLIC_PATHS` | `["/"]` | 加 `/health`、`/about` 等未登录可访问的路径 |
| 默认登录后落地页 | `authenticate.ts` `resolve()` fallback | `"/dashboard"` | 你应用的默认首页 |
| 登录页路径 | `proxy.ts` `new URL("/login", …)` | `/login` | 登录服务用 `/auth/sign-in` 等其它路径时改 |
| Fragment 字段名 | `proxy.ts` + `callback.tsx` | `redirect_uri`、`source`、`token`、`tenant_code` | 匹配登录服务实际字段 |

---

## 安装

下方每个文件先**检查是否已存在**：

- 不存在：直接 Write 创建（按下方片段照写）
- 已存在：按 **"## 已存在时如何合并"** 一节走——**严禁直接 Write 覆盖**，会丢失用户已有的代码

可以直接拷贝的文件（项目里通常没有）：

- `lib/auth/cookies.ts`
- `lib/auth/session.ts`
- `lib/auth/guards.ts`
- `lib/auth/authenticate.ts`
- `features/auth/components/callback.tsx`
- `features/auth/index.ts`

需要合并的文件（项目里通常已存在）：

- `env.ts`
- `proxy.ts`（如果存在）
- `app/page.tsx`

---

## 文件清单

按下面顺序创建（先 lib/，再 features/，再 root，最后处理 page.tsx 的合并）。每个 `###` 标题下的代码块就是该路径的完整内容。

---

### lib/auth/ —— 鉴权基建

#### `lib/auth/cookies.ts`

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

#### `lib/auth/session.ts`

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

#### `lib/auth/guards.ts`

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

#### `lib/auth/authenticate.ts`

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
  // 如果你的浏览器侧从不读它，改成 httpOnly。
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

---

### features/auth/ —— 客户端回调

#### `features/auth/components/callback.tsx`

```tsx
"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { authenticate } from "@/lib/auth/authenticate";

/**
 * SSO 回调处理器 —— 挂载在 `app/page.tsx`，也就是 IdP 回跳的落地页。
 * 从 `window.location.hash` 读 token + tenant_code，转发给 `authenticate`
 * （由它写 cookie），然后做整页导航跳走。
 *
 * 整页导航（不是 `router.replace`）是故意的：cookie 刚写好，软 RSC fetch
 * 可能跟 proxy.ts 的 cookie 检查抢跑——抢输了会拿到跨 origin 302 回 IdP，
 * 在浏览器侧表现为 "TypeError: Failed to fetch"。整页刷新能把新 cookie
 * 走线发出去。
 */
export function Callback() {
  // React strict-mode 在 dev 下会跑两遍 effect —— 防止双回调。
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

#### `features/auth/index.ts`

```ts
// Barrel —— 仅导出 UI。Server Action 直接从 @/lib/auth/* 引入，
// 这样 "use server" directive 在 import 点保持可见。

export { Callback } from "./components/callback";
```

---

### 根目录 —— 网关

#### `proxy.ts`

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
 *
 * 未命中时：把原始 URL 存进 `continue`（仅限真实用户导航——见下方注释），
 * 然后 302 跳到 IdP，**fragment** 里带
 *   redirect_uri=${NEXT_PUBLIC_APP_URL}&source=sso
 * —— IdP SPA 自己解析 location.hash。
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

  // 只有顶层用户导航时才记住 URL。后台探测（Chrome DevTools 的 `.well-known`、
  // source-map 抓取、降级到整页导航的 RSC fetch）**不能**污染 continue cookie。
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
    // 排除框架资源和约定的探测路径——proxy 不应处理它们
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

#### `.env.example`（追加而非覆盖）

如果项目根已有 `.env.example`，**追加**以下两行；没有就直接 Write 整个文件：

```
NEXT_PUBLIC_AUTH_URL=https://your-idp.example.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 已存在时如何合并

### `env.ts`

如果用户已在用 `@t3-oss/env-nextjs`，**不要覆盖**整个 `env.ts`。Read 现有文件，把以下两条 schema 字段 + runtimeEnv 映射并入：

```ts
client: {
  // ... 用户原有字段
  NEXT_PUBLIC_AUTH_URL: z.url(),
  NEXT_PUBLIC_APP_URL: z.url(),
},
runtimeEnv: {
  // ... 用户原有映射
  NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
},
```

如果项目里**没有** `env.ts`（理论上 nextjs-scaffold 已经创建了一个空壳），直接 Write 下面的版本：

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * 运行时环境变量校验。proxy.ts 在 module load 时就引用它，
 * 缺变量会在启动时崩，不会拖到请求时才暴露。
 *
 * runtimeEnv 必须列出每一个 key，这样 Next.js 才能在构建期 inline NEXT_PUBLIC_*。
 */
export const env = createEnv({
  server: {
    // API_BASE_URL:  z.url(),
    // DATABASE_URL:  z.url(),
    // SERVICE_TOKEN: z.string().min(1),
    // AUTH_SECRET:   z.string().min(32),
  },
  client: {
    /** IdP base URL。proxy.ts 会拼上 `/login` 和 fragment 里的 redirect_uri。 */
    NEXT_PUBLIC_AUTH_URL: z.url(),

    /**
     * 本应用对外暴露的 canonical origin。作为发给 IdP 的 SSO redirect_uri，
     * 必须跟 IdP 白名单逐字符匹配——别信反向代理后的 `request.nextUrl.origin`
     * （Host 头不可信）。
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

### `proxy.ts`（已存在的情况）

如果用户已经写了自定义 middleware 逻辑，**不要覆盖**——把上面 `proxy()` 函数里的"`PUBLIC_PATHS` 检查 + cookie 检查 + 重定向"逻辑合并进去，matcher 也合并。

### `app/page.tsx`（首页几乎一定存在）

`app/page.tsx` 是 Next.js 项目入口首页，**几乎一定已经存在**——不存在"目标文件不存在所以直接拷贝"这种情况。

安装流程是：**Read 用户的现有 `app/page.tsx`，根据它的结构自行判断怎么把 `<Callback />` 集成进去**。每个项目的首页都不一样（landing 页、redirect 转发、客户端渲染的 dashboard、纯静态 marketing 页……），不存在通用 3 步走。

判断时要考虑的几个维度：

#### 1. 看是 Server Component 还是 Client Component

- 首行有 `"use client"` → 是 Client Component。**不能** `await auth()`（server-only）。只能把 `<Callback />` 挂进去，已登录跳转得用别的姿势处理。
- 没有 `"use client"` → 是 Server Component（默认）。可以 `await auth()` 直接判断 session。

#### 2. 看用户的 return 结构

- 返回的是单个根元素（`<div>...</div>`、`<main>...</main>`）→ 需要包一层 Fragment：`<>...<Callback />...</>`，或者把 `<Callback />` 塞进根元素内部。
- 返回的已经是 Fragment 或 array → 直接加。
- `<Callback />` 不渲染任何东西（return null），插哪里都不影响视觉。常见做法是放在 return 的第一个位置。

#### 3. 看用户是否已有鉴权逻辑

- 已有 `auth()` / `getServerSession()` / 类似检查 → 不要重复，沿用现有的；只加 `<Callback />`。
- 已有 client-side 的 "if not logged in then redirect" 逻辑 → 跟 `<Callback />` 协调，避免双跳。

#### 4. 判断 `/` 的语义，决定要不要加"已登录跳转"

- `/` 是"未登录用户的入口落地页"，已登录用户应该去 `/dashboard` → 加 `const session = await auth(); if (session) redirect("/dashboard");`
- `/` 是公共 landing 页（已登录用户也能看） → 只加 `<Callback />`，不加 session 跳转
- 拿不准 → 直接问用户

#### 强制最小集成 + 可选强化

| 改动 | 强制还是可选 |
| --- | --- |
| `import { Callback } from "@/features/auth";` + JSX 中 `<Callback />` | **强制**（不加这一步登录回调彻底不工作） |
| `import { auth }` + `await auth() + redirect("/dashboard")` | 可选（看 `/` 的语义） |
| `async function Home()`（把 sync 改 async） | 仅当加了 `await auth()` 才需要 |
| `<>...<Callback />...</>` 包 Fragment | 仅当原 return 是单元素时 |

#### 完整合并示例（**仅供参考**，实际请按用户的真实文件改）

scaffold 默认生成的 `app/page.tsx` 是：

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

合并后变成：

```tsx
import { redirect } from "next/navigation";

import { Callback } from "@/features/auth";
import { auth } from "@/lib/auth/session";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8">
      <p className="text-muted-foreground text-sm">正在登录…</p>
      <Callback />
    </main>
  );
}
```

但如果用户的 `app/page.tsx` 是别的形态（Client Component、已经有 redirect 逻辑、复杂 layout、`use client` 顶部等），结果完全不一样——AI 必须 Read 实际文件后自行判断。**不要照抄上面的示例**。

---

## 端到端流程

```
1. 未鉴权访问
   GET /dashboard
   ▸ proxy.ts: 没有 token cookie
   ▸ 写 continue=/dashboard（5 分钟、httpOnly）
   ▸ 302 Location: ${LOGIN_URL}/login#redirect_uri=${APP}&source=sso

2. 外部登录
   浏览器跳到登录 SPA，SPA 读自己的 location.hash 拿 redirect_uri
   [用户完成登录]
   登录 SPA: window.location.href = "${APP}#token=…&tenant_code=…"

3. 回调 bootstrap（关键的部分）
   GET /                                ← fragment 永远不到服务器
     Cookie: continue=/dashboard        ← 跨整段登录跳转保留下来了
   ▸ app/page.tsx 渲染 <Callback />，此时还没有 session
   浏览器 hydrate，useEffect 触发：
     ▸ window.location.hash → { token, tenant_code }
     ▸ history.replaceState 立刻清掉地址栏的 fragment
     ▸ POST / (authenticate Server Action)
         Set-Cookie: token=…   (httpOnly)
         Set-Cookie: tenant_code=…
         Set-Cookie: continue=; Max-Age=0   ← 消费掉
         Body: { next: "/dashboard" }       ← 从 continue cookie 读出来
     ▸ window.location.replace("/dashboard")

4. 已鉴权访问
   GET /dashboard
     Cookie: token=…
   ▸ proxy.ts: 有 token → NextResponse.next()
   ▸ 200 OK
```

整个回环能跑通靠这三件事：

| 机制 | 为什么不能少 |
| --- | --- |
| proxy.ts 在 302 前写 `continue` cookie | URL fragment 无法跨登录页可靠传递"原始路径"；cookie 在浏览器侧能跨整段登录跳转保留 |
| `Sec-Fetch-Dest: document` 检查 | 后台探测（DevTools 的 `.well-known`、source map 等）不会污染 `continue` |
| `window.location.replace`（不是 `router.replace`） | 刚写好的 cookie 需要走完整页面导航才能稳带；软导航的 RSC fetch 会撞 "Failed to fetch RSC payload" |

> 关于 fragment 里的 `source=sso` 字段：这只是登录服务约定的一个标识参数，名字"sso"是登录服务那边的命名，并不代表本 skill 实现了 SSO。把它换成 `source=login` 之类也完全可以——看登录服务期望什么字符串。

---

## 安全检查

- [x] Token cookie 是 `httpOnly`（XSS 读不到）
- [x] 生产环境加 `Secure` 标志（只在 HTTPS 上发送）
- [x] `SameSite: lax`（顶层跨站导航能带，后台 fetch 拦截掉）
- [x] Token 长度上限（`max(4096)` —— 大 JWT 可以放宽）
- [x] `tenant_code` 用正则 `/^[A-Za-z0-9_-]+$/` 防 CRLF 注入
- [x] `resolve()` 拒绝外部 URL（必须以单 `/` 开头、不允许 `//` 开头）
- [x] `Sec-Fetch-Dest: document` 守卫 `continue` cookie，防探测污染
- [x] `history.replaceState` 立刻清掉地址栏的 fragment
- [x] Server Action 用 zod 校验入参（即便客户端被绕过也守得住）
- [ ] CSRF `state` 参数（**未实现** —— 如果登录服务支持就加上；不加的话，知道 redirect_uri 的攻击者可以构造任意 token 灌给你的 `authenticate` Action）
- [ ] Token 签名验证（**未实现** —— 如果你收到的是 JWT，应该在 `auth()` 里用登录服务的 JWKS 验签）

---

## 验收清单

装完跟用户对一遍：

- [ ] 创建了 `lib/auth/{cookies,session,guards,authenticate}.ts` 四个文件
- [ ] 创建了 `features/auth/{index.ts,components/callback.tsx}` 两个文件
- [ ] 创建/合并了 `proxy.ts`
- [ ] `env.ts` 包含 `NEXT_PUBLIC_AUTH_URL` + `NEXT_PUBLIC_APP_URL` 两条 schema 字段 + runtimeEnv 映射
- [ ] `app/page.tsx` 包含 `<Callback />` 渲染
- [ ] `.env.local` 填了两个 URL（提示用户填）
- [ ] 访问受保护路径（如 `/dashboard`）会被 302 跳到 `NEXT_PUBLIC_AUTH_URL/login`
- [ ] 模拟登录回来（手动构造 `#token=test&tenant_code=demo` 到 `/`），cookie 被写、跳回 `/dashboard`
