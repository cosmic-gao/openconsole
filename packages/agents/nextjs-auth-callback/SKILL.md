---
name: nextjs-auth-callback
description: >
  Next.js 16 外部登录回调集成。外部登录页用 URL fragment 把 token 送回应用，
  应用读取后通过 Server Action 写 httpOnly cookie 建立本地登录态。
  
  触发场景：需要登录、加用户授权、登录功能、用户登录、未登录跳转、鉴权、接 SSO、
  外部登录、登录回调、token 回调、auth callback、protected routes、proxy.ts 鉴权。
---

# Next.js 16 外部登录回调

外部登录页通过 URL fragment 把 token 送回应用，应用接住后写 httpOnly cookie 建立本地登录态，并保留用户登录前想去的 URL。

## 这是什么，不是什么

| 你以为的 | 实际是 |
| --- | --- |
| Single Sign-On (SSO) | 不是。本 skill 只覆盖"单个应用怎么接住外部登录给的 token" |
| OAuth code flow | 不是。本 skill 是前端 SPA 直接把 token 用 URL fragment 送过来 |
| OIDC | 不是。本 skill 不假设 token 格式 |

## 适用场景

✓ 外部登录页是 SPA，用 `window.location.href = "<app>#token=…"` 跳回
✓ Token 必须存进 `httpOnly` cookie
✓ Token 不能出现在 server access log / Referer header / 用户分享的链接里

## 核心机制

| 机制 | 作用 |
| --- | --- |
| proxy.ts 在 302 前写 `continue` cookie | URL fragment 无法跨登录页传递"原始路径"，cookie 能跨整段登录跳转保留 |
| `Sec-Fetch-Dest: document` 检查 | 后台探测不会污染 `continue` cookie |
| `window.location.replace` | 刚写好的 cookie 需要走完整页面导航才能稳带 |

详见 [flow.md](./references/flow.md)。

---

## 安装

### 1. 问用户配置

```json
{
  "questions": [
    {
      "question": "登录页面的网址是什么？",
      "header": "登录地址"
    },
    {
      "question": "你当前应用部署在哪里？",
      "header": "应用地址"
    }
  ]
}
```

### 2. 创建文件

详见 [core-files.md](./references/core-files.md)。

### 3. 合并已存在文件

详见 [merge-guide.md](./references/merge-guide.md)。

---

## 关键代码模式

### Server Action 写 Cookie

```ts
"use server";

const Schema = z.object({
  token: z.string().min(1).max(4096),
  tenantCode: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export async function authenticate(input) {
  const { token, tenantCode } = Schema.parse(input);
  const jar = await cookies();

  jar.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_MAX_AGE,
  });

  return { next: resolve(jar.get(CONTINUE_COOKIE)?.value) };
}
```

### Edge Middleware

```ts
export function proxy(request: NextRequest) {
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (request.cookies.has(TOKEN_COOKIE)) return NextResponse.next();

  const fragment = `redirect_uri=${encodeURIComponent(env.NEXT_PUBLIC_APP_URL)}&source=sso`;
  const loginUrl = new URL("/login", env.NEXT_PUBLIC_AUTH_URL);
  loginUrl.hash = fragment;

  const response = NextResponse.redirect(loginUrl);

  if (request.headers.get("sec-fetch-dest") === "document") {
    response.cookies.set(CONTINUE_COOKIE, pathname + search, { /* ... */ });
  }

  return response;
}
```

### 回调组件

```tsx
"use client";

export function Callback() {
  useEffect(() => {
    const raw = window.location.hash.slice(1);
    const params = new URLSearchParams(raw);
    const token = params.get("token");
    const tenantCode = params.get("tenant_code");

    history.replaceState(null, "", window.location.pathname);

    authenticate({ token, tenantCode })
      .then(({ next }) => window.location.replace(next));
  }, []);

  return null;
}
```

---

## 安全措施

详见 [security.md](./references/security.md)。

已实现：httpOnly cookie、Secure flag、SameSite、token 长度限制、tenant_code 正则校验、resolve() 拒绝外部 URL。

未实现：CSRF state 参数、Token 签名验证。

---

## 详细参考

- [references/flow.md](./references/flow.md) — 端到端流程
- [references/installation.md](./references/installation.md) — 完整安装步骤
- [references/merge-guide.md](./references/merge-guide.md) — 已存在文件合并
- [references/core-files.md](./references/core-files.md) — 所有核心文件代码
- [references/security.md](./references/security.md) — 安全检查清单
