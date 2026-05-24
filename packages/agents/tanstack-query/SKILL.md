---
name: tanstack-query
description: TanStack Query v5 最佳工程实践。包括目录结构、Provider 设置、queryOptions 模式、API + query 内聚、useSuspenseQuery、useMutation、缓存管理等。触发场景：客户端数据获取、缓存管理、乐观更新、useSuspenseQuery、useMutation、queryOptions 配置。
---

# TanStack Query v5 最佳工程实践

## 目录结构（强制）

### 基础设施层（lib/query/）

```
lib/
└── query/
    ├── get-query-client.ts    # Per-request QueryClient
    └── provider.tsx           # QueryClientProvider
```

### 业务 API 层（features/<domain>/api/）

```
features/post/
├── api/
│   ├── post.ts     # API 方法 + queryOptions（内聚）
│   ├── schemas.ts  # Zod schemas
│   └── index.ts    # barrel
├── components/
├── server/
└── index.ts
```

### 分工原则

| 目录 | 内容 | 为什么 |
| --- | --- | --- |
| `lib/query/` | QueryClient 初始化 + Provider | 基础设施，所有业务共用 |
| `features/<domain>/api/` | API 方法 + queryOptions | 业务相关，跟随 domain |

---

## Provider 设置（强制）

### lib/query/provider.tsx

```tsx
'use client'

import { isServer, QueryClient, QueryClientProvider } from '@tanstack/react-query'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,        // 1 分钟
        gcTime: 5 * 60 * 1000,       // 5 分钟（v5: 原来是 cacheTime）
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined = undefined

export function getQueryClient() {
  if (isServer) return makeQueryClient()
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
    </QueryClientProvider>
  )
}
```

### 使用方式

```tsx
// app/layout.tsx
import { Providers } from '@/lib/query/provider'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

---

## API 服务层（强制）

### lib/http/request.ts（HTTP 客户端）

```typescript
// lib/http/request.ts
import { ofetch } from 'ofetch'

export const request = ofetch.create({
  baseURL: '/api',
  timeout: 5000,
  retry: 1,
  onRequest({ options }) {
    // 添加 auth header
    // const token = getToken()
    // if (token) options.headers.set('Authorization', `Bearer ${token}`)
  },
  onResponseError({ response }) {
    if (response.status === 401) {
      // 处理未授权
    }
  },
})
```

### features/post/api/post.ts（API + queryOptions 内聚）

```typescript
// features/post/api/post.ts
import { queryOptions } from '@tanstack/react-query'
import { request } from '@/lib/http/request'
import type { Post, CreatePostDto, UpdatePostDto } from './schemas'

// API 方法
export const post = {
  list: () => request<Post[]>('/posts'),
  get: (id: string) => request<Post>(`/posts/${id}`),
  create: (data: CreatePostDto) => request<Post>('/posts', { method: 'POST', body: data }),
  update: (id: string, data: UpdatePostDto) => request<Post>(`/posts/${id}`, { method: 'PUT', body: data }),
  delete: (id: string) => request<void>(`/posts/${id}`, { method: 'DELETE' }),
}

// queryOptions（queryKey + queryFn 内聚）
export const postQuery = {
  all: () => queryOptions({
    queryKey: ['post'],
    queryFn: post.list,
  }),
  list: (filters?: string) => queryOptions({
    queryKey: ['post', 'list', { filters }],
    queryFn: () => post.list(),
  }),
  detail: (id: string) => queryOptions({
    queryKey: ['post', 'detail', id],
    queryFn: () => post.get(id),
  }),
}
```

---

## Query Hooks（强制）

### useSuspenseQuery（默认）

```tsx
// features/post/components/post-list.tsx
'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

function PostList() {
  const { data: posts } = useSuspenseQuery(postQuery.all())

  return (
    <div>
      {posts.map(p => <PostCard key={p.id} post={p} />)}
    </div>
  )
}

// 配合 Suspense 使用
<Suspense fallback={<PostListSkeleton />}>
  <PostList />
</Suspense>
```

### useMutation

```tsx
// features/post/components/post-form.tsx
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { post, postQuery } from '@/features/post/api/post'
import { toast } from 'sonner'

export function CreatePostForm() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: post.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post'] })
      toast.success('创建成功')
    },
    onError: () => {
      toast.error('创建失败')
    },
  })

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      const formData = new FormData(e.currentTarget)
      mutation.mutate({
        title: formData.get('title') as string,
        content: formData.get('content') as string,
      })
    }}>
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? '保存中...' : '保存'}
      </button>
    </form>
  )
}
```

### useQuery（Legacy，仅在需要 component-level loading 时用）

```tsx
function PostList() {
  const { data, isPending, error } = useQuery(postQuery.all())

  if (isPending) return <Skeleton />
  if (error) return <Error error={error} />

  return <div>{data.map(p => <PostCard key={p.id} post={p} />)}</div>
}
```

---

## 乐观更新

```tsx
const mutation = useMutation({
  mutationFn: ({ id, data }: { id: string; data: UpdatePostDto }) => post.update(id, data),
  onMutate: async ({ id, data }) => {
    await queryClient.cancelQueries({ queryKey: ['post', 'detail', id] })
    const previous = queryClient.getQueryData(['post', 'detail', id])
    queryClient.setQueryData(['post', 'detail', id], data)
    return { previous }
  },
  onError: (err, { id }, context) => {
    queryClient.setQueryData(['post', 'detail', id], context?.previous)
  },
  onSettled: ({ id }) => {
    queryClient.invalidateQueries({ queryKey: ['post', 'detail', id] })
  },
})
```

---

## 缓存管理

### Invalidation

```typescript
// 所有 post 相关
queryClient.invalidateQueries({ queryKey: ['post'] })

// 特定详情
queryClient.invalidateQueries({ queryKey: ['post', 'detail', postId] })

// 列表
queryClient.invalidateQueries({ queryKey: ['post', 'list'] })
```

### Prefetching

```typescript
// 鼠标悬停预取
const prefetch = (id: string) => {
  queryClient.prefetchQuery(postQuery.detail(id))
}

<Link to={`/post/${p.id}`} onMouseEnter={() => prefetch(p.id)}>
  {p.title}
</Link>
```

### ensureQueryData

```typescript
// 数据不存在时才 fetch
await queryClient.ensureQueryData(postQuery.detail(id))
```

---

## 常见错误

### 1. hydration mismatch

```tsx
// ❌ 错误：服务端和客户端状态不一致
function Component() {
  const { data } = useQuery({
    queryKey: ['data'],
    queryFn: fetchData,
  })
  return <div>{data.map(...)}</div>
}

// ✅ 正确：配合 Suspense
<Suspense fallback={<Skeleton />}>
  <Component />
</Suspense>
```

### 2. 使用 queryOptions 保持 key 一致

```tsx
// ❌ 错误：手动拼 key 容易不一致
const { data } = useQuery({
  queryKey: ['post', 'detail', id],
  queryFn: () => post.get(id),
})

// ✅ 正确：使用 queryOptions
const { data } = useQuery(postQuery.detail(id))
```

### 3. 在 Server Component 使用 useQuery

```tsx
// ❌ 错误：Server Component 不能用 useQuery
export default async function Page() {
  const { data } = useQuery(...)  // 不支持！
  return <div>{data}</div>
}

// ✅ 正确：Server Component 直接 await
export default async function Page() {
  const posts = await post.list()
  return <PostList posts={posts} />
}
```

---

## v5 Breaking Changes

| v4 | v5 | 说明 |
| --- | --- | --- |
| `isLoading` | `isPending` | 更好地反映加载状态 |
| `cacheTime` | `gcTime` | 垃圾回收时间 |
| `keepPreviousData` | `placeholderData` | 函数形式用于转换 |
| `onError/onSuccess/onSettled` | 从 useQuery 移除 | 使用 useEffect 或 mutation 的 onSettled |

---

## 禁止事项

- **不要**在 Server Component 使用 useQuery/useSuspenseQuery
- **不要**手动拼 queryKey，使用 queryOptions 工厂函数
- **不要**混用 SWR 和 TanStack Query
- **不要**在 client 组件里用 async function（用 useEffect 或 React 19 use()）

---

## 外部参考

- [TanStack Query v5 Docs](https://tanstack.com/query/latest)
- [TanStack Query GitHub](https://github.com/TanStack/query)
- [ofetch](https://github.com/unjs/ofetch)
