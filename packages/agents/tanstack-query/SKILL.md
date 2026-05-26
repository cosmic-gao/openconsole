---
name: tanstack-query
description: TanStack Query v5 在 opentemplate 中的标准用法 —— 目录结构、QueryClient 设置、queryKey 工厂、queryOptions 模式、queryFn 调 Server Action、useSuspenseQuery + initialData、useMutation 乐观更新。触发场景:客户端数据获取、缓存管理、乐观更新、useSuspenseQuery、useMutation、queryOptions 配置。
---

# TanStack Query v5 在 opentemplate 中的标准用法

> 权威实现参考:`features/notes/`(`E:/opencode/oepntemplate/features/notes/`)。
> 全局架构见 [`../AGENTS.md`](../AGENTS.md);项目骨架见
> [`../nextjs-best-practices/references/scaffold.md`](../nextjs-best-practices/references/scaffold.md)。

## 目录结构(强制)

### 基础设施层 `lib/query/`

```
lib/
└── query/
    ├── client.ts        # makeQueryClient + getQueryClient(per-request)
    ├── provider.tsx     # "use client" QueryProvider + Devtools
    └── index.ts         # barrel
```

### 业务层 `features/<domain>/queries/`

```
features/notes/
├── actions.ts                # "use server" —— queryFn 就是这里的函数
├── _cached.ts                # "use cache" —— 实际读数据库 / BFF
├── schemas.ts                # zod schemas
├── components/
└── queries/
    ├── keys.ts               # query key 工厂
    └── options.ts            # queryOptions(queryKey + queryFn)
```

### 分工原则

| 目录 | 内容 | 为什么 |
| --- | --- | --- |
| `lib/query/` | `QueryClient` 初始化 + Provider | 基建,所有业务共用 |
| `features/<domain>/queries/keys.ts` | query key 工厂(`xxxKeys.all/list/detail`) | 同 domain 的 key 集中,避免散落 |
| `features/<domain>/queries/options.ts` | `queryOptions` 工厂(`xxxQueries.list/detail`) | queryFn 必定调本 domain 的 Server Action |

**禁止**:把 `queryOptions` 散落在 component 里、直接写裸的 `useQuery({queryKey,queryFn})`。

---

## Provider 设置(强制)

### `lib/query/client.ts`

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
        staleTime: 60 * 1000,      // 1 分钟
        gcTime: 5 * 60 * 1000,     // 5 分钟(v5: 原来叫 cacheTime)
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

### `lib/query/provider.tsx`

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

### `lib/query/index.ts`

```ts
export { getQueryClient } from "./client";
export { QueryProvider } from "./provider";
```

### 在根 layout 中使用

```tsx
// app/layout.tsx
import { QueryProvider } from "@/lib/query";

<NuqsAdapter>
  <ThemeProvider ...>
    <FontProvider>
      <QueryProvider>{children}</QueryProvider>
    </FontProvider>
  </ThemeProvider>
</NuqsAdapter>
```

---

## queryFn 调 Server Action(不是 fetch)

opentemplate 的核心约定:**queryFn 调本 domain 的 Server Action**,Server Action 内部转发到 `_cached.ts` 或直接业务逻辑。**不**让客户端直接 `ofetch("/api/...")`。

为什么:Server Action 是 RPC 端点,统一签名;查询和变更都用同一组函数;鉴权 / 缓存失效 / Cache Components 都在 Server Action 一层处理。

### `features/notes/queries/keys.ts`

```ts
export const noteKeys = {
  all: () => ["notes"] as const,
  list: () => [...noteKeys.all(), "list"] as const,
  detail: (id: number) => [...noteKeys.all(), "detail", id] as const,
};
```

### `features/notes/queries/options.ts`

```ts
import { queryOptions } from "@tanstack/react-query";

import { getNote, listNotes } from "../actions";
import { noteKeys } from "./keys";

export const noteQueries = {
  list: () =>
    queryOptions({
      queryKey: noteKeys.list(),
      queryFn: () => listNotes(),           // Server Action
      staleTime: 30 * 1000,
    }),
  detail: (id: number) =>
    queryOptions({
      queryKey: noteKeys.detail(id),
      queryFn: () => getNote(id),            // Server Action
      staleTime: 30 * 1000,
    }),
};
```

> 注意:queryFn 是箭头函数包装 —— 直接 `queryFn: listNotes` 会把 TanStack 内部传给 queryFn 的 `QueryFunctionContext` 当成参数传给 Server Action,Server Action 的 zod 校验就会失败。永远 `queryFn: () => listNotes()`。

### `features/notes/actions.ts`(参考片段)

```ts
"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";

import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";

import { getNoteCached, listNotesCached } from "./_cached";
import { NoteId, NoteInput } from "./schemas";

export async function listNotes() {
  return listNotesCached();           // _cached.ts 是 "use cache"
}

export async function getNote(rawId: unknown) {
  const id = NoteId.parse(rawId);
  return getNoteCached(id);
}

export async function createNote(input: unknown) {
  const { title, content } = NoteInput.parse(input);
  const [row] = await db.insert(notes).values({ title, content }).returning();
  updateTag("notes:list");             // 失效 Cache Components
  return row;
}
```

---

## Query Hooks

### 默认用 `useSuspenseQuery` + `initialData`(RSC 预取 → Client 消费)

opentemplate 的核心数据流:

```
RSC: await listNotes() → initialData
        ↓
Client: useSuspenseQuery({ ...noteQueries.list(), initialData })
```

```tsx
// app/(dashboard)/notes/page.tsx (RSC)
import { Suspense } from "react";

import { listNotes } from "@/features/notes/actions";
import { NotesTable } from "@/features/notes/components/notes-table";

export default function NotesPage() {
  return (
    <Suspense fallback={<NotesSkeleton />}>
      <NotesShell />
    </Suspense>
  );
}

async function NotesShell() {
  const data = await listNotes();         // 走 _cached.ts
  return <NotesTable initialData={data} />;
}
```

```tsx
// features/notes/components/notes-table.tsx
"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import type { Note } from "@/lib/db/schema";

import { noteQueries } from "../queries/options";

export function NotesTable({ initialData }: { initialData: Note[] }) {
  const { data: notes } = useSuspenseQuery({
    ...noteQueries.list(),
    initialData,
  });
  // 后续 mutation 后 setQueryData 直接更新这份 cache
}
```

> **为什么不用 HydrationBoundary**:Cache Components + `"use server"` queryFn 在 Next 16 与 HydrationBoundary 不稳定。模板统一走 `initialData` 喂入,**这是当前推荐姿势**。

### `useQuery`(可选,客户端独立请求)

```tsx
import { useQuery } from "@tanstack/react-query";
import { noteQueries } from "../queries/options";

const { data, isPending, error } = useQuery(noteQueries.list());

if (isPending) return <Skeleton />;
if (error) return <ErrorState err={error} />;
return <NotesTable initialData={data} />;
```

### `useMutation` + 直接更新缓存

```tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Note } from "@/lib/db/schema";

import { createNote } from "../actions";
import { noteKeys } from "../queries/keys";
import { NoteInput } from "../schemas";

const queryClient = useQueryClient();

const mutation = useMutation({
  mutationFn: (input: NoteInput) => createNote(input),
  onSuccess: (row) => {
    // 直接把新数据 push 进 list cache,避免一次 refetch
    queryClient.setQueryData<Note[]>(noteKeys.list(), (old = []) =>
      row ? [row, ...old] : old,
    );
    toast.success("Created");
  },
  onError: (err) => {
    toast.error(err instanceof Error ? err.message : "Failed");
  },
});
```

> Server Action 内部已经 `updateTag("notes:list")` 失效了 Cache Components。
> 客户端这里再做 `setQueryData` 是为了让当前 tab 立刻看到新数据,不必等下次
> RSC 重渲。两条路径(server cache tag / client query cache)是独立的。

---

## 乐观更新

```tsx
const mutation = useMutation({
  mutationFn: ({ id, data }: { id: number; data: NoteInput }) =>
    updateNote(id, data),

  // 1. 取消任何 in-flight refetch
  onMutate: async ({ id, data }) => {
    await queryClient.cancelQueries({ queryKey: noteKeys.detail(id) });
    const previous = queryClient.getQueryData<Note>(noteKeys.detail(id));
    queryClient.setQueryData<Note>(noteKeys.detail(id), (old) =>
      old ? { ...old, ...data } : old,
    );
    return { previous, id };
  },

  // 2. 失败回滚
  onError: (err, vars, ctx) => {
    if (ctx?.previous) {
      queryClient.setQueryData(noteKeys.detail(ctx.id), ctx.previous);
    }
    toast.error("Save failed");
  },

  // 3. 成功 / 失败都 invalidate 一下,跟 server 对齐
  onSettled: (_data, _err, vars) => {
    queryClient.invalidateQueries({ queryKey: noteKeys.detail(vars.id) });
    queryClient.invalidateQueries({ queryKey: noteKeys.list() });
  },
});
```

---

## 缓存管理

### Invalidation

```ts
// 整个 namespace
queryClient.invalidateQueries({ queryKey: noteKeys.all() });

// 单条详情
queryClient.invalidateQueries({ queryKey: noteKeys.detail(noteId) });

// 列表
queryClient.invalidateQueries({ queryKey: noteKeys.list() });
```

### Prefetching

```tsx
const prefetch = (id: number) => {
  queryClient.prefetchQuery(noteQueries.detail(id));
};

<Link href={`/notes/${id}`} onMouseEnter={() => prefetch(id)}>
  {title}
</Link>;
```

### setQueryData 直接更新

```ts
// 删除后从 list 中移除
queryClient.setQueryData<Note[]>(noteKeys.list(), (old = []) =>
  old.filter((n) => n.id !== id),
);

// 失效具体详情
queryClient.removeQueries({ queryKey: noteKeys.detail(id) });
```

---

## 常见错误

### 1. 在 `'use cache'` 函数里读 cookies

→ 用 `_cached.ts` + `actions.ts` 两层。详见
[`../nextjs-best-practices/references/data-layer.md`](../nextjs-best-practices/references/data-layer.md)。

### 2. queryFn 漏了箭头包装

```tsx
// ❌ TanStack 会把 QueryFunctionContext 传进去,Server Action zod 报错
queryOptions({ queryKey: noteKeys.list(), queryFn: listNotes })

// ✓
queryOptions({ queryKey: noteKeys.list(), queryFn: () => listNotes() })
```

### 3. 手动拼 queryKey 跟 invalidate 用的 key 不一致

```tsx
// ❌ 散落在 component 里
const { data } = useQuery({ queryKey: ["notes", "list"], ... });
queryClient.invalidateQueries({ queryKey: ["note", "list"] });  // 单数!失效不到

// ✓ 唯一来源 noteKeys 工厂
const { data } = useQuery(noteQueries.list());
queryClient.invalidateQueries({ queryKey: noteKeys.list() });
```

### 4. Server Component 用 useQuery

```tsx
// ❌ Server Component 不能用 useQuery
export default async function Page() {
  const { data } = useQuery(...);  // 报错
}

// ✓ Server Component 直接 await Server Action
export default async function Page() {
  const data = await listNotes();
  return <NotesTable initialData={data} />;
}
```

### 5. Client 组件 async function

```tsx
// ❌ Client 组件不能是 async
"use client";
export default async function NotesTable() { ... }

// ✓ async 在 server 端做,client 通过 props / hooks 拿数据
```

---

## v5 Breaking Changes

| v4 | v5 | 说明 |
| --- | --- | --- |
| `isLoading` | `isPending` | 更准确反映加载态 |
| `cacheTime` | `gcTime` | 垃圾回收时间 |
| `keepPreviousData: true` | `placeholderData: keepPreviousData` | import keepPreviousData helper |
| `onError/onSuccess/onSettled` 在 `useQuery` | 移除 | 改用 `useEffect` 或 `useMutation` 的回调 |
| `useQueries({ queries: [...] })` | 同 | 接口未变 |

---

## 禁止

- ❌ Server Component 用 `useQuery` / `useSuspenseQuery`(它们是 client-only)
- ❌ 手写 `queryKey: [...]` ——必须用 `xxxKeys.xxx()` 工厂
- ❌ 混用 SWR(`@tanstack/react-query` 是项目唯一客户端缓存库)
- ❌ Client 组件用 `async function`(用 `useEffect` 或 React 19 `use()` hook)
- ❌ queryFn 直接传 Server Action 引用 —— 永远 `() => action()` 包一层
- ❌ 在 `features/<domain>/index.ts` re-export `actions.ts` —— `"use server"` directive 必须在 import 点可见
- ❌ 把 HTTP client 放 `lib/http/` —— 模板约定是 `lib/request/`(`app/api/` 已经占了 "api" 一词)

---

## 外部参考

- [TanStack Query v5 Docs](https://tanstack.com/query/latest)
- [Next 16 Cache Components](https://nextjs.org/docs/app/getting-started/caching-and-revalidating)
- [`../nextjs-best-practices/references/data-layer.md`](../nextjs-best-practices/references/data-layer.md) —— 模板完整数据层
- [`../nextjs-best-practices/references/features.md`](../nextjs-best-practices/references/features.md) —— 加新 feature 切片
