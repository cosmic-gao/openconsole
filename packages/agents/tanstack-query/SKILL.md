---
name: tanstack-query
description: TanStack Query v5 最佳工程实践。包括目录结构、Provider 设置、API 服务层模式、Query Keys 工厂、useSuspenseQuery、useMutation、缓存管理等。触发场景：客户端数据获取、缓存管理、乐观更新、useSuspenseQuery、useMutation、Query Keys 配置。
---

# TanStack Query v5 最佳工程实践

## 目录结构（强制）

### 基础设施层（lib/query/）

```
lib/
└── query/
    ├── get-query-client.ts    # per-request QueryClient
    └── provider.tsx           # QueryClientProvider
```

### 业务 API 层（features/<domain>/api/）

```
features/posts/
├── api/
│   ├── postsApi.ts           # API 方法封装
│   └── postsKeys.ts         # Query Keys 工厂
├── components/
├── server/
├── schemas.ts
└── index.ts
```

### 分工原则

| 目录 | 内容 | 为什么 |
| --- | --- | --- |
| `lib/query/` | QueryClient 初始化 + Provider | 基础设施，所有业务共用 |
| `features/<domain>/api/` | API 方法 + Query Keys | 业务相关，跟随 domain |

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

### features/posts/api/postsApi.ts

```typescript
// features/posts/api/postsApi.ts
import { request } from '@/lib/http/request'
import type { Post, CreatePostDto, UpdatePostDto } from '../schemas'

export const postsApi = {
  getAll: (): Promise<Post[]> =>
    request('/posts'),

  get: (id: string): Promise<Post> =>
    request(`/posts/${id}`),

  create: (data: CreatePostDto): Promise<Post> =>
    request('/posts', { method: 'POST', body: data }),

  update: (id: string, data: UpdatePostDto): Promise<Post> =>
    request(`/posts/${id}`, { method: 'PUT', body: data }),

  delete: (id: string): Promise<void> =>
    request(`/posts/${id}`, { method: 'DELETE' }),
}
```

### features/posts/api/postsKeys.ts

```typescript
// features/posts/api/postsKeys.ts
export const postsKeys = {
  all: ['posts'] as const,
  lists: () => [...postsKeys.all, 'list'] as const,
  list: (filters: string) => [...postsKeys.lists(), { filters }] as const,
  details: () => [...postsKeys.all, 'detail'] as const,
  detail: (id: string) => [...postsKeys.details(), id] as const,
}
```

---

## Query Hooks（强制）

### useSuspenseQuery（默认）

```tsx
// features/posts/components/post-list.tsx
'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { postsApi } from '@/features/posts/api/postsApi'
import { postsKeys } from '@/features/posts/api/postsKeys'

function PostList() {
  const { data: posts } = useSuspenseQuery({
    queryKey: postsKeys.lists(),
    queryFn: postsApi.getAll,
  })

  return (
    <div>
      {posts.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
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
// features/posts/components/post-form.tsx
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postsApi } from '@/features/posts/api/postsApi'
import { postsKeys } from '@/features/posts/api/postsKeys'
import { toast } from 'sonner'

export function CreatePostForm() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: postsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postsKeys.lists() })
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
  const { data, isPending, error } = useQuery({
    queryKey: postsKeys.lists(),
    queryFn: postsApi.getAll,
  })

  if (isPending) return <Skeleton />
  if (error) return <Error error={error} />

  return <div>{data.map(post => <PostCard key={post.id} post={post} />)}</div>
}
```

---

## 乐观更新

```tsx
const mutation = useMutation({
  mutationFn: postsApi.update,
  onMutate: async (updatedPost) => {
    await queryClient.cancelQueries({ queryKey: postsKeys.detail(updatedPost.id) })

    const previousPost = queryClient.getQueryData(postsKeys.detail(updatedPost.id))

    queryClient.setQueryData(postsKeys.detail(updatedPost.id), updatedPost)

    return { previousPost }
  },
  onError: (err, updatedPost, context) => {
    queryClient.setQueryData(postsKeys.detail(updatedPost.id), context?.previousPost)
  },
  onSettled: (data, error, variables) => {
    queryClient.invalidateQueries({ queryKey: postsKeys.detail(variables.id) })
  },
})
```

---

## 缓存管理

### Invalidation

```typescript
// 单个 query
queryClient.invalidateQueries({ queryKey: postsKeys.lists() })

// 特定 id
queryClient.invalidateQueries({ queryKey: postsKeys.detail(postId) })

// 所有 queries
queryClient.invalidateQueries()
```

### Prefetching

```typescript
// 鼠标悬停预取
const prefetchPost = (postId: string) => {
  queryClient.prefetchQuery({
    queryKey: postsKeys.detail(postId),
    queryFn: () => postsApi.get(postId),
  })
}

<Link
  to={`/posts/${post.id}`}
  onMouseEnter={() => prefetchPost(post.id)}
>
  {post.title}
</Link>
```

### ensureQueryData

```typescript
// 数据不存在时才 fetch
await queryClient.ensureQueryData({
  queryKey: postsKeys.detail(id),
  queryFn: () => postsApi.get(id),
})
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

### 2. Query Key 不一致

```tsx
// ❌ 错误：key 格式不统一
const { data } = useQuery({
  queryKey: ['post', id],      // 格式 1
  queryFn: () => postsApi.get(id),
})

// ✅ 正确：使用工厂函数
const { data } = useQuery({
  queryKey: postsKeys.detail(id),  // 格式统一
  queryFn: () => postsApi.get(id),
})
```

### 3. 在 Server Component 使用 useQuery

```tsx
// ❌ 错误：Server Component 不能用 useQuery
export default async function Page() {
  const { data } = useQuery({...})  // 不支持！
  return <div>{data}</div>
}

// ✅ 正确：Server Component 直接 await
export default async function Page() {
  const posts = await postsApi.getAll()
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
- **不要**在 queryFn 外部直接调用 fetch，用工厂函数
- **不要**混用 SWR 和 TanStack Query
- **不要**在 client 组件里用 async function（用 useEffect 或 React 19 use()）

---

## 外部参考

- [TanStack Query v5 Docs](https://tanstack.com/query/latest)
- [TanStack Query GitHub](https://github.com/TanStack/query)
- [ofetch](https://github.com/unjs/ofetch)
