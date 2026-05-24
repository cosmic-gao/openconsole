# TanStack Query 高级数据获取模式

## 依赖查询

依赖于其他查询结果的查询：

```typescript
import { useQuery } from '@tanstack/react-query'
import { userQuery } from '@/features/user/api/user'

// 第一个查询 - 获取用户 ID
const { data: user } = useQuery(userQuery.me())

// 第二个查询 - 依赖于用户 ID
const { data: posts } = useQuery({
  queryKey: ['post', 'user', user?.id],
  queryFn: () => post.listByUser(user!.id),
  enabled: !!user
})
```

## 并行查询

同时获取多个独立的查询：

```typescript
import { useQueries } from '@tanstack/react-query'
import { postQuery, statsQuery, notificationQuery } from '@/features/dashboard/api'

function Dashboard() {
  const [postsResult, statsResult, notificationsResult] = useQueries({
    queries: [
      postQuery.recent(),
      statsQuery.summary(),
      notificationQuery.all(),
    ]
  })

  if (postsResult.isPending) return <Loading />

  return <Dashboard
    stats={statsResult.data}
    posts={postsResult.data}
    notifications={notificationsResult.data}
  />
}
```

## 无限查询

用于分页和无限滚动：

```typescript
import { useInfiniteQuery } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage
} = useInfiniteQuery({
  ...postQuery.paginated(1),
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})

const allPosts = data?.pages.flatMap(page => page.list) ?? []

return (
  <div>
    {allPosts.map(post => <PostCard key={post.id} post={post} />)}
    {hasNextPage && (
      <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
        {isFetchingNextPage ? '加载中...' : '加载更多'}
      </button>
    )}
  </div>
)
```

## 预获取

在需要之前预加载数据：

```typescript
import { useQueryClient } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

function PostLink({ id }: { id: string }) {
  const queryClient = useQueryClient()

  const handleMouseEnter = () => {
    queryClient.prefetchQuery(postQuery.detail(id))
  }

  return (
    <Link to={`/post/${id}`} onMouseEnter={handleMouseEnter}>
      查看帖子
    </Link>
  )
}
```

## Suspense 模式

配合 React Suspense 使用：

```typescript
import { useSuspenseQuery } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

function PostDetails({ id }: { id: string }) {
  const { data: post } = useSuspenseQuery(postQuery.detail(id))

  return <div>{post.title}</div>
}

// 用 Suspense 包裹
<Suspense fallback={<Loading />}>
  <PostDetails id="123" />
</Suspense>
```

## 查询取消

组件卸载时取消查询：

```typescript
import { useQuery } from '@tanstack/react-query'
import { searchQuery } from '@/features/search/api'

const { data } = useQuery({
  ...searchQuery.byTerm(searchTerm),
  cancelToken: new AbortController().signal
})
```

## 初始数据

提供初始数据以避免加载状态：

```typescript
import { useQuery } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

const { data } = useQuery({
  ...postQuery.detail(id),
  initialData: () => queryClient.getQueryData(['post', 'list'])?.find(p => p.id === id)
})
```

## 占位数据

加载时显示占位符：

```typescript
import { useQuery } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

const { data, isPlaceholderData } = useQuery({
  ...postQuery.paginated(page),
  placeholderData: (previousData) => previousData
})
```

## 带查询的乐观更新

立即更新 UI，错误时回滚：

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { post, postQuery } from '@/features/post/api/post'

const queryClient = useQueryClient()

const { mutate } = useMutation({
  mutationFn: ({ id, data }) => post.update(id, data),
  onMutate: async ({ id, data }) => {
    await queryClient.cancelQueries(postQuery.detail(id))
    const previous = queryClient.getQueryData(['post', 'detail', id])
    queryClient.setQueryData(['post', 'detail', id], data)
    return { previous }
  },
  onError: (err, { id }, context) => {
    queryClient.setQueryData(['post', 'detail', id], context?.previous)
  },
  onSettled: ({ id }) => {
    queryClient.invalidateQueries(postQuery.detail(id))
  }
})
```

## 查询重试

配置重试行为：

```typescript
import { useQuery } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

const { data } = useQuery({
  ...postQuery.detail(id),
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
})
```

## 错误处理

处理查询错误：

```typescript
import { useQuery } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

const { data, error, isError } = useQuery({
  ...postQuery.detail(id),
  throwOnError: false
})

if (isError) {
  return <ErrorMessage error={error} />
}
```

## 最佳实践

1. **使用 Suspense** - 配合 React Suspense 获得更好的加载 UX
2. **意图时预获取** - 悬停/聚焦时预加载数据
3. **条件启用查询** - 使用 `enabled` 选项
4. **卸载时取消** - 使用 abort signals
5. **优雅处理错误** - 显示错误状态
6. **使用占位符优化** - 加载时显示之前的数据
