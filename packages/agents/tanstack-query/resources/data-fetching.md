# TanStack Query 高级数据获取模式

## 依赖查询

依赖于其他查询结果的查询：

```typescript
// 第一个查询 - 获取用户 ID
const { data: user } = useQuery({
  queryKey: ['user'],
  queryFn: fetchCurrentUser
});

// 第二个查询 - 依赖于用户 ID
const { data: posts } = useQuery({
  queryKey: ['posts', user?.id],
  queryFn: () => fetchUserPosts(user!.id),
  enabled: !!user // 仅当 user 可用时执行
});
```

## 并行查询

同时获取多个独立的查询：

```typescript
function Dashboard() {
  const queries = useQueries({
    queries: [
      { queryKey: ['stats'], queryFn: fetchStats },
      { queryKey: ['recentPosts'], queryFn: fetchRecentPosts },
      { queryKey: ['notifications'], queryFn: fetchNotifications }
    ]
  });

  const [statsQuery, postsQuery, notificationsQuery] = queries;

  if (queries.some(q => q.isLoading)) return <Loading />;

  return <Dashboard
    stats={statsQuery.data}
    posts={postsQuery.data}
    notifications={notificationsQuery.data}
  />;
}
```

## 无限查询

用于分页和无限滚动：

```typescript
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage
} = useInfiniteQuery({
  queryKey: ['posts'],
  queryFn: ({ pageParam = 1 }) => fetchPosts(pageParam),
  getNextPageParam: (lastPage, pages) => lastPage.nextCursor,
  initialPageParam: 1
});

// 扁平化 pages
const allPosts = data?.pages.flatMap(page => page.posts) ?? [];

return (
  <div>
    {allPosts.map(post => <PostCard key={post.id} post={post} />)}
    {hasNextPage && (
      <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
        {isFetchingNextPage ? '加载中...' : '加载更多'}
      </button>
    )}
  </div>
);
```

## 预获取

在需要之前预加载数据：

```typescript
import { useQueryClient } from '@tanstack/react-query';

function PostLink({ postId }: { postId: string }) {
  const queryClient = useQueryClient();

  const handleMouseEnter = () => {
    queryClient.prefetchQuery({
      queryKey: ['post', postId],
      queryFn: () => fetchPost(postId)
    });
  };

  return (
    <Link to={`/posts/${postId}`} onMouseEnter={handleMouseEnter}>
      查看帖子
    </Link>
  );
}
```

## Suspense 模式

配合 React Suspense 使用：

```typescript
import { useSuspenseQuery } from '@tanstack/react-query';

function PostDetails({ postId }: { postId: string }) {
  // 加载时抛出 promise，错误时抛出错误
  const { data: post } = useSuspenseQuery({
    queryKey: ['post', postId],
    queryFn: () => fetchPost(postId)
  });

  return <div>{post.title}</div>;
}

// 用 Suspense 包裹
<Suspense fallback={<Loading />}>
  <PostDetails postId="123" />
</Suspense>
```

## 查询取消

组件卸载时取消查询：

```typescript
const { data, isLoading } = useQuery({
  queryKey: ['search', searchTerm],
  queryFn: async ({ signal }) => {
    const response = await fetch(`/api/search?q=${searchTerm}`, { signal });
    return response.json();
  }
});
```

## 初始数据

提供初始数据以避免加载状态：

```typescript
const { data } = useQuery({
  queryKey: ['post', postId],
  queryFn: () => fetchPost(postId),
  initialData: () => {
    // 从缓存或其他来源获取
    return queryClient.getQueryData(['posts'])?.find((post) => post.id === postId);
  }
});
```

## 占位数据

加载时显示占位符：

```typescript
const { data, isPlaceholderData } = useQuery({
  queryKey: ['posts', page],
  queryFn: () => fetchPosts(page),
  placeholderData: (previousData) => previousData  // 加载时保持上一页数据
});

// 或提供静态占位符
placeholderData: { posts: [], total: 0 }
```

## 带查询的乐观更新

立即更新 UI，错误时回滚：

```typescript
const queryClient = useQueryClient();

const { mutate } = useMutation({
  mutationFn: updatePost,
  onMutate: async (newPost) => {
    // 取消进行中的 queries
    await queryClient.cancelQueries({ queryKey: ['post', newPost.id] });

    // 快照当前值
    const previousPost = queryClient.getQueryData(['post', newPost.id]);

    // 乐观更新
    queryClient.setQueryData(['post', newPost.id], newPost);

    return { previousPost };
  },
  onError: (err, newPost, context) => {
    // 错误时回滚
    queryClient.setQueryData(['post', newPost.id], context?.previousPost);
  },
  onSettled: (newPost) => {
    // 成功或错误后重新获取
    queryClient.invalidateQueries({ queryKey: ['post', newPost.id] });
  }
});
```

## 查询重试

配置重试行为：

```typescript
const { data } = useQuery({
  queryKey: ['post', postId],
  queryFn: () => fetchPost(postId),
  retry: 3, // 重试 3 次
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000) // 指数退避
});
```

## 错误处理

处理查询错误：

```typescript
const { data, error, isError } = useQuery({
  queryKey: ['post', postId],
  queryFn: () => fetchPost(postId),
  throwOnError: false  // 不抛出错误，只设置 error
});

if (isError) {
  return <ErrorMessage error={error} />;
}
```

## 最佳实践

1. **使用 Suspense** - 配合 React Suspense 获得更好的加载 UX
2. **意图时预获取** - 悬停/聚焦时预加载数据
3. **条件启用查询** - 使用 `enabled` 选项
4. **卸载时取消** - 使用 abort signals
5. **优雅处理错误** - 显示错误状态
6. **使用占位符优化** - 加载时显示之前的数据
