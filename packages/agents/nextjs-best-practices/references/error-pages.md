# Error Pages —— 错误页系统

> Next 16 提供 5 个 special files + `unauthorized()` / `forbidden()` 两个新函数。
> 模板**全部已经实现**,业务方只需要在合适的时机抛错或调函数。**禁止**自己写 401 / 403 / 404 / 500 页面。

---

## 五个文件 vs 五种触发

| 文件 | 何时触发 | 用 atoms 组件 | 必须 `"use client"` |
| --- | --- | --- | --- |
| `app/not-found.tsx` | 路由不存在 / `notFound()` 被调 | `<NotFound>` | 否 |
| `app/unauthorized.tsx` | `unauthorized()` 被调 | `<Unauthorized>` | 否 |
| `app/forbidden.tsx` | `forbidden()` 被调 | `<Forbidden>` | 否 |
| `app/error.tsx` | route segment 内抛错 | `<ServerError>` + Try-again 按钮 | **是** |
| `app/global-error.tsx` | root layout 内抛错(很少进) | `<ServerError>`,自渲 `<html>` / `<body>` | **是** |

---

## 模板内容

### `app/not-found.tsx`

```tsx
import { NotFound } from "@openconsole/atoms";
export default function NotFoundPage() {
  return <NotFound />;
}
```

### `app/unauthorized.tsx`

```tsx
import { Unauthorized } from "@openconsole/atoms";
export default function UnauthorizedPage() {
  return <Unauthorized />;
}
```

### `app/forbidden.tsx`

```tsx
import { Forbidden } from "@openconsole/atoms";
export default function ForbiddenPage() {
  return <Forbidden />;
}
```

### `app/error.tsx`

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
        error.message || "An unexpected error occurred. Please try again later."
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

### `app/global-error.tsx`

```tsx
"use client";

import { ServerError } from "@openconsole/atoms";
import { Button } from "@openconsole/shadcn";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app:global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ServerError
          description={error.message || "An unexpected error occurred. Please try again later."}
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

**关键**:`global-error.tsx` 必须自渲 `<html>`/`<body>`,因为它**替换**了 root layout(root layout 已经崩了)。

---

## `app/(errors)/*` —— 直接可访问的错误页

除了上面的 boundary 文件,模板还提供五个**直接可访问的路由**:

| 路径 | 内容 |
| --- | --- |
| `/error` | 500 ServerError |
| `/forbidden` | 403 Forbidden |
| `/maintenance` | 503 Maintenance |
| `/not-found` | 404 NotFound |
| `/unauthorized` | 401 Unauthorized |

实现极简:

```tsx
// app/(errors)/error/page.tsx
import { ServerError } from "@openconsole/atoms";
export const metadata = { title: "500 — Internal Server Error" };
export default function ServerErrorPage() { return <ServerError />; }
```

### 用途

- **运维 / 客服**直接发链接告诉用户当前状态(`/maintenance` 公告)
- **健康检查**对接 `/error` 看渲染是否正常
- **测试**:开发时直接访问看错误页样子

---

## 何时用哪个

### Server Action 鉴权失败

```ts
"use server";
import { unauthorized, forbidden } from "next/navigation";
import { getSession } from "@/features/auth/server/session";

export async function deleteOrder(id: number) {
  const session = await getSession();
  if (!session) unauthorized();                       // 401 → app/unauthorized.tsx

  const me = await getMe();
  if (!me.roleList?.some(r => r.name === "admin")) {
    forbidden();                                       // 403 → app/forbidden.tsx
  }

  // …
}
```

`unauthorized()` / `forbidden()` 需要 `next.config.ts` 的 `experimental.authInterrupts: true`(模板已开)。

### 资源不存在

```ts
"use server";
import { notFound } from "next/navigation";

export async function getOrder(id: number) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order) notFound();                              // 404 → app/not-found.tsx
  return order;
}
```

### 普通错误(被 segment error boundary 接住)

```ts
"use server";

export async function processPayment(orderId: number) {
  try {
    await chargeCustomer(orderId);
  } catch (err) {
    throw new Error("Payment processing failed");      // → app/error.tsx
  }
}
```

UI 那边:

```tsx
"use client";
const mutation = useMutation({
  mutationFn: processPayment,
  onError: (err) => toast.error(err.message),
});
```

或让它冒泡到 boundary:

```tsx
async function ServerPart() {
  await processPayment(1);                              // 抛错 → app/error.tsx
}
```

### 计划性维护

切换流量到 maintenance 页(运维操作,通过 LB 直接路由到 `/maintenance`)。

---

## 自定义错误页内容

atoms 的五个错误组件都接受 props:

```tsx
import { NotFound } from "@openconsole/atoms";

// 在 app/(custom-feature)/not-found.tsx —— 覆盖默认
export default function CustomNotFound() {
  return (
    <NotFound
      title="文章不存在"
      description="你访问的文章可能已被删除或迁移到了其它位置。"
      actions={<Link href="/notes" className="...">回到 Notes</Link>}
    />
  );
}
```

可定制:`status` / `title` / `description` / `icon` / `actions` / `className`。

---

## 嵌套 error boundary

`app/error.tsx` 是**根 boundary**。要 segment 级别独立处理(比如某个 feature 的错误不影响整页),在该 segment 加 `error.tsx`:

```
app/
├── error.tsx                       # 根 boundary
└── (dashboard)/
    └── notes/
        ├── page.tsx
        └── error.tsx               # /notes 专属 boundary(只接住 /notes 子树的错误)
```

---

## 不要做

- ❌ 自己写 `<div>404 Not Found</div>` —— 用 atoms 的 `<NotFound>`
- ❌ 在 `error.tsx` 里去掉 `"use client"` —— Next 16 要求
- ❌ 在 `global-error.tsx` 里去掉 `<html>` / `<body>` —— 它替换了 root layout
- ❌ 在 `error.tsx` 里调 `cookies()` / Server Action —— 它是 client component
- ❌ 用 try-catch 吞掉所有错误然后 toast —— 系统级错误应该走 boundary
- ❌ 在普通 server action 里 `throw new Response("401", { status: 401 })` —— 用 `unauthorized()`
- ❌ 自己 redirect 到 `/unauthorized` —— 调 `unauthorized()` 让 Next 处理

---

## Try-again 行为

`error.tsx` 收到 `reset` prop,点击后会重新渲染 boundary 内的内容(再次尝试 RSC / Server Action)。**不是**全页刷新。

要全页刷新:

```tsx
<Button onClick={() => window.location.reload()}>Reload</Button>
```

要回到首页:

```tsx
<Button asChild>
  <Link href="/">Go home</Link>
</Button>
```

---

## Error digest 与日志

`app/error.tsx` 收到的 `error.digest` 是 Next 自动生成的 ID(server 端日志里也会有),便于在生产 / Sentry 里追踪具体哪个错误:

```tsx
"use client";
useEffect(() => {
  // 模板的范式
  console.error("[app:error]", error);

  // 加 Sentry 之后:
  // Sentry.captureMessage(`[app:error] digest=${error.digest}`);
}, [error]);
```

`instrumentation.ts` 的 `onRequestError` 钩子也会收到所有 server 端错误,模板已经写入 `lib/logger` 的 consola(也带 digest)。

---

## Checklist

- [ ] 5 个 special files 都存在,内容是 atoms 组件
- [ ] `error.tsx` 和 `global-error.tsx` 首行 `"use client"`
- [ ] `global-error.tsx` 自渲 `<html><body>`
- [ ] `(errors)/*` 五个直接可访问页都在
- [ ] Server Action 用 `unauthorized()` / `forbidden()` / `notFound()`,不自己 throw / redirect
- [ ] 自定义错误页通过 atoms 组件的 props,不重写组件
- [ ] `next.config.ts` 的 `experimental.authInterrupts: true` 没被关
