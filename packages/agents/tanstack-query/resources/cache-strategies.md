# 缓存管理策略

## 缓存时间配置

```typescript
const { data } = useQuery({
  queryKey: ['posts'],
  queryFn: fetchPosts,
  staleTime: 5 * 60 * 1000, // 5 分钟内视为新鲜
  gcTime: 10 * 60 * 1000     // 在缓存中保留 10 分钟（原来是 cacheTime）
});
```

## 缓存失效

### 失效特定查询

```typescript
const queryClient = useQueryClient();

// 失效所有帖子查询
queryClient.invalidateQueries({ queryKey: ['posts'] });

// 失效特定帖子
queryClient.invalidateQueries({ queryKey: ['post', postId] });

// 精确匹配失效
queryClient.invalidateQueries({
  queryKey: ['posts'],
  exact: true // 只匹配 ['posts']，不匹配 ['posts', 'list']
});
```

### Mutation 时失效

```typescript
const { mutate } = useMutation({
  mutationFn: createPost,
  onSuccess: () => {
    // 失效并重新获取
    queryClient.invalidateQueries({ queryKey: ['posts'] });
  }
});
```

## 手动缓存更新

### 设置查询数据

```typescript
// 直接更新缓存
queryClient.setQueryData(['post', postId], (oldData) => ({
  ...oldData,
  title: '新标题'
}));

// 设置新数据
queryClient.setQueryData(['post', postId], newPost);
```

### 获取查询数据

```typescript
// 从缓存读取
const cachedPost = queryClient.getQueryData(['post', postId]);

// 用于 initialData
const { data } = useQuery({
  queryKey: ['post', postId],
  queryFn: () => fetchPost(postId),
  initialData: () => queryClient.getQueryData(['posts'])?.find((p) => p.id === postId)
});
```

## 重新获取策略

### 窗口焦点时重新获取

```typescript
const { data } = useQuery({
  queryKey: ['posts'],
  queryFn: fetchPosts,
  refetchOnWindowFocus: true // 标签页重新获得焦点时重新获取
});
```

### 重新连接时重新获取

```typescript
const { data } = useQuery({
  queryKey: ['posts'],
  queryFn: fetchPosts,
  refetchOnReconnect: true // 网络重新连接时重新获取
});
```

### 定时重新获取

```typescript
const { data } = useQuery({
  queryKey: ['live-data'],
  queryFn: fetchLiveData,
  refetchInterval: 5000, // 每 5 秒重新获取
  refetchIntervalInBackground: false // 标签页不活跃时暂停
});
```

## 缓存持久化

### 持久化到 localStorage

```typescript
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24  // 24 小时
    }
  }
});

const persister = createSyncStoragePersister({
  storage: window.localStorage
});

<PersistQueryClientProvider
  client={queryClient}
  persister={persister}
>
  <App />
</PersistQueryClientProvider>
```

## 缓存去重

### 自动请求去重

```typescript
// 两个组件共享同一请求
function Component1() {
  const { data } = useQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts
  });
}

function Component2() {
  const { data } = useQuery({
    queryKey: ['posts'], // 相同 key = 相同请求
    queryFn: fetchPosts
  });
}
```

## 缓存预加载

### 预获取查询

```typescript
const queryClient = useQueryClient();

// 导航前预获取
const handleMouseEnter = () => {
  queryClient.prefetchQuery({
    queryKey: ['post', postId],
    queryFn: () => fetchPost(postId)
  });
};

// 在 loader 中预获取
router.beforeEach(async (to, from, next) => {
  await queryClient.prefetchQuery({
    queryKey: ['user', to.params.userId],
    queryFn: () => fetchUser(to.params.userId)
  });
  next();
});
```

### 确保查询数据

```typescript
// 如果缓存中没有则获取，否则使用缓存
await queryClient.ensureQueryData({
  queryKey: ['post', postId],
  queryFn: () => fetchPost(postId)
});
```

## 选择性缓存更新

### 更新嵌套数据

```typescript
queryClient.setQueryData(['posts'], (oldPosts) => {
  return oldPosts.map((post) => (post.id === updatedPost.id ? updatedPost : post));
});
```

### 添加到列表缓存

```typescript
// 创建帖子后
queryClient.setQueryData(['posts'], (oldPosts = []) => {
  return [newPost, ...oldPosts];
});
```

### 从列表缓存删除

```typescript
// 删除帖子后
queryClient.setQueryData(['posts'], (oldPosts) => {
  return oldPosts.filter((post) => post.id !== deletedPostId);
});
```

## 缓存调试

### React Query Devtools

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

<QueryClientProvider client={queryClient}>
  <App />
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

### 查询缓存事件

```typescript
const queryCache = queryClient.getQueryCache();

queryCache.subscribe((event) => {
  console.log('查询缓存事件:', event.type, event.query.queryKey);
});
```

## 最佳实践

1. **设置合适的 staleTime** - 平衡新鲜度和性能
2. **使用失效而非重新获取** - 让查询在需要时重新获取
3. **可预测地预获取** - 悬停/意图时预加载数据
4. **Mutation 时更新缓存** - 保持 UI 同步
5. **使用 Devtools** - 可视化调试缓存问题
6. **持久化重要数据** - 保存到 localStorage 以支持离线
7. **去重请求** - 依赖自动去重
