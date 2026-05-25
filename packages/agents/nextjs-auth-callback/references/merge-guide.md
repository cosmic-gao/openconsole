# 已存在文件合并指南

## env.ts

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

## proxy.ts（已存在的情况）

如果用户已经写了自定义 middleware 逻辑，**不要覆盖**——把 `proxy()` 函数里的"PUBLIC_PATHS 检查 + cookie 检查 + 重定向"逻辑合并进去，matcher 也合并。

## app/page.tsx（首页几乎一定存在）

安装流程是：**Read 用户的现有 `app/page.tsx`，根据它的结构自行判断怎么把 `<Callback />` 集成进去**。

### 1. 看是 Server Component 还是 Client Component

- 首行有 `"use client"` → 是 Client Component。**不能** `await auth()`（server-only）。只能把 `<Callback />` 挂进去。
- 没有 `"use client"` → 是 Server Component（默认）。可以 `await auth()` 直接判断 session。

### 2. 看用户的 return 结构

- 返回的是单个根元素 → 需要包一层 Fragment：`<>...<Callback />...</>`
- 返回的已经是 Fragment 或 array → 直接加
- `<Callback />` 不渲染任何东西（return null），插哪里都不影响视觉

### 3. 看用户是否已有鉴权逻辑

- 已有 `auth()` / `getServerSession()` / 类似检查 → 不要重复，沿用现有的；只加 `<Callback />`
- 已有 client-side 的 "if not logged in then redirect" 逻辑 → 跟 `<Callback />` 协调，避免双跳

### 4. 决定 `/` 的语义

| `/` 语义 | 要加的逻辑 |
| --- | --- |
| 未登录用户的入口落地页，已登录用户应该去 `/dashboard` | `const session = await auth(); if (session) redirect("/dashboard");` |
| 公共 landing 页（已登录用户也能看） | 只加 `<Callback />`，不加 session 跳转 |
| 拿不准 | 直接问用户 |

### 强制最小集成

| 改动 | 强制还是可选 |
| --- | --- |
| `import { Callback } from "@/features/auth";` + JSX 中 `<Callback />` | **强制** |
| `import { auth }` + `await auth() + redirect("/dashboard")` | 可选 |
| `async function Home()`（把 sync 改 async） | 仅当加了 `await auth()` 才需要 |

### 合并示例

scaffold 默认生成的 `app/page.tsx`：

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

如果用户的 `app/page.tsx` 是别的形态，结果完全不一样——**必须 Read 实际文件后自行判断**。
