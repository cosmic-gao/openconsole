# 缓存管理策略

## 缓存时间配置

```typescript
import { useQuery } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

const { data } = useQuery({
  ...postQuery.list(),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000
})
```

## 缓存失效

### 失效特定查询

```typescript
import { useQueryClient } from '@tanstack/react-query'

const queryClient = useQueryClient()

queryClient.invalidateQueries({ queryKey: ['post'] })
queryClient.invalidateQueries({ queryKey: ['post', 'detail', postId] })
queryClient.invalidateQueries({ queryKey: ['post'], exact: true })
```

### Mutation 时失效

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'

const { mutate } = useMutation({
  mutationFn: post.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['post'] })
  }
})
```

## 手动缓存更新

### 设置查询数据

```typescript
import { useQueryClient } from '@tanstack/react-query'

queryClient.setQueryData(['post', 'detail', id], (oldData) => ({
  ...oldData,
  title: '新标题'
}))

queryClient.setQueryData(['post', 'detail', id], newPost)
```

### 获取查询数据

```typescript
import { useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

const queryClient = useQueryClient()

const cachedPost = queryClient.getQueryData(['post', 'detail', id])

const { data } = useQuery({
  ...postQuery.detail(id),
  initialData: () => queryClient.getQueryData(['post', 'list'])?.find(p => p.id === id)
})
```

## 重新获取策略

### 窗口焦点时重新获取

```typescript
import { useQuery } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

const { data } = useQuery({
  ...postQuery.list(),
  refetchOnWindowFocus: true
})
```

### 重新连接时重新获取

```typescript
import { useQuery } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

const { data } = useQuery({
  ...postQuery.list(),
  refetchOnReconnect: true
})
```

### 定时重新获取

```typescript
import { useQuery } from '@tanstack/react-query'
import { liveQuery } from '@/features/live/api'

const { data } = useQuery({
  ...liveQuery.prices(),
  refetchInterval: 5000,
  refetchIntervalInBackground: false
})
```

## 缓存持久化

### 持久化到 localStorage

```typescript
import { QueryClient, PersistQueryClientProvider } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24
    }
  }
})

const persister = createSyncStoragePersister({
  storage: window.localStorage
})

<PersistQueryClientProvider client={queryClient} persister={persister}>
  <App />
</PersistQueryClientProvider>
```

## 缓存去重

### 自动请求去重

```typescript
function Component1() {
  const { data } = useQuery(postQuery.list())
}

function Component2() {
  const { data } = useQuery(postQuery.list())
}
```

## 缓存预加载

### 预获取查询

```typescript
import { useQueryClient } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

const queryClient = useQueryClient()

const handleMouseEnter = () => {
  queryClient.prefetchQuery(postQuery.detail(id))
}

router.beforeEach(async (to) => {
  await queryClient.prefetchQuery(postQuery.detail(to.params.id))
})
```

### 确保查询数据

```typescript
import { useQueryClient } from '@tanstack/react-query'
import { postQuery } from '@/features/post/api/post'

const queryClient = useQueryClient()

await queryClient.ensureQueryData(postQuery.detail(id))
```

## 选择性缓存更新

### 更新嵌套数据

```typescript
queryClient.setQueryData(['post', 'list'], (oldPosts) => {
  return oldPosts.map((p) => (p.id === updatedPost.id ? updatedPost : p))
})
```

### 添加到列表缓存

```typescript
queryClient.setQueryData(['post', 'list'], (oldPosts = []) => {
  return [newPost, ...oldPosts]
})
```

### 从列表缓存删除

```typescript
queryClient.setQueryData(['post', 'list'], (oldPosts) => {
  return oldPosts.filter((p) => p.id !== deletedPostId)
})
```

## 缓存调试

### React Query Devtools

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

<QueryClientProvider client={queryClient}>
  <App />
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

### 查询缓存事件

```typescript
const queryCache = queryClient.getQueryCache()

queryCache.subscribe((event) => {
  console.log('查询缓存事件:', event.type, event.query.queryKey)
})
```

## 最佳实践

1. **设置合适的 staleTime** - 平衡新鲜度和性能
2. **使用失效而非重新获取** - 让查询在需要时重新获取
3. **可预测地预获取** - 悬停/意图时预加载数据
4. **Mutation 时更新缓存** - 保持 UI 同步
5. **使用 Devtools** - 可视化调试缓存问题
6. **持久化重要数据** - 保存到 localStorage 以支持离线
7. **去重请求** - 依赖自动去重
