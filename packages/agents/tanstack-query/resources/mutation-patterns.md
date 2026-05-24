# 复杂 Mutation 模式

## 基础 Mutations

```typescript
const { mutate, isPending, isError, error } = useMutation({
  mutationFn: (newPost: CreatePostDto) => createPost(newPost),
  onSuccess: (data) => {
    console.log('帖子已创建:', data);
  },
  onError: (error) => {
    console.error('创建帖子失败:', error);
  }
});

// 触发 mutation
mutate({ title: '新帖子', content: '...' });
```

## 乐观更新

立即更新 UI，错误时回滚：

```typescript
const { mutate } = useMutation({
  mutationFn: updatePost,
  onMutate: async (newPost) => {
    // 取消进行中的 refetch
    await queryClient.cancelQueries({ queryKey: ['posts'] });

    // 快照之前的值
    const previousPosts = queryClient.getQueryData(['posts']);

    // 乐观更新为新值
    queryClient.setQueryData(['posts'], (old) =>
      old.map((post) => (post.id === newPost.id ? newPost : post))
    );

    // 返回包含快照的 context
    return { previousPosts };
  },
  onError: (err, newPost, context) => {
    // 回滚到之前的值
    queryClient.setQueryData(['posts'], context.previousPosts);
  },
  onSettled: () => {
    // 无论成功或错误都重新 fetch
    queryClient.invalidateQueries({ queryKey: ['posts'] });
  }
});
```

## 顺序 Mutations

按顺序执行 mutations：

```typescript
const createAndPublish = async (postData) => {
  // 创建帖子
  const post = await createPostMutation.mutateAsync(postData);

  // 发布帖子
  const published = await publishPostMutation.mutateAsync(post.id);

  return published;
};
```

## 并行 Mutations

同时执行多个 mutations：

```typescript
const { mutate } = useMutation({
  mutationFn: async (updates) => {
    const results = await Promise.all([
      updateProfile(updates.profile),
      updateSettings(updates.settings),
      updatePreferences(updates.preferences)
    ]);
    return results;
  }
});
```

## 带失效的 Mutation

```typescript
const { mutate } = useMutation({
  mutationFn: createPost,
  onSuccess: () => {
    // 失效并重新获取
    queryClient.invalidateQueries({ queryKey: ['posts'] });

    // 或直接更新缓存
    queryClient.setQueryData(['posts'], (old) => [newPost, ...old]);
  }
});
```

## 多缓存更新

```typescript
const { mutate } = useMutation({
  mutationFn: deletePost,
  onSuccess: (_, deletedPostId) => {
    // 更新帖子列表
    queryClient.setQueryData(['posts'], (old) => old.filter((post) => post.id !== deletedPostId));

    // 更新帖子计数
    queryClient.setQueryData(['postsCount'], (old) => old - 1);

    // 失效相关 queries
    queryClient.invalidateQueries({ queryKey: ['user', 'stats'] });
  }
});
```

## 错误处理

```typescript
const { mutate, isError, error, reset } = useMutation({
  mutationFn: createPost,
  onError: (error) => {
    if (error.code === 'VALIDATION_ERROR') {
      setFormErrors(error.fields);
    } else if (error.code === 'NETWORK_ERROR') {
      showRetryDialog();
    } else {
      showGenericError();
    }
  }
});

// 清除错误状态
reset();
```

## 重试失败的 Mutations

```typescript
const { mutate } = useMutation({
  mutationFn: createPost,
  retry: 3, // 失败重试 3 次
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000) // 指数退避
});
```

## 带加载状态的 Mutation

```typescript
function CreatePostForm() {
  const { mutate, isPending } = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      navigate('/posts');
    }
  });

  const handleSubmit = (data) => {
    mutate(data);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* 表单字段 */}
      <button type="submit" disabled={isPending}>
        {isPending ? '创建中...' : '创建帖子'}
      </button>
    </form>
  );
}
```

## 带变量的 Mutation

```typescript
const { mutate, variables } = useMutation({
  mutationFn: updatePost
});

// 获取上一次 mutation 的变量
console.log('上次更新的帖子:', variables);
```

## Mutation 回调

```typescript
const { mutate } = useMutation({
  mutationFn: createPost,
  onMutate: (variables) => {
    console.log('开始 mutation:', variables);
  },
  onSuccess: (data, variables, context) => {
    console.log('成功!', data);
  },
  onError: (error, variables, context) => {
    console.error('错误!', error);
  },
  onSettled: (data, error, variables, context) => {
    console.log('Mutation 完成（成功或错误）');
  }
});
```

## 带表单集成的 Mutation

```typescript
import { useForm } from 'react-hook-form';

function CreatePostForm() {
  const { register, handleSubmit, reset } = useForm();

  const { mutate, isPending, isError, error } = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      reset();  // 清空表单
      toast.success('帖子已创建!');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const onSubmit = (data) => {
    mutate(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('title')} />
      <textarea {...register('content')} />
      <button type="submit" disabled={isPending}>
        提交
      </button>
      {isError && <ErrorMessage error={error} />}
    </form>
  );
}
```

## Mutation 状态重置

```typescript
const { mutate, data, error, reset } = useMutation({
  mutationFn: createPost
});

// 清除 mutation 状态
const handleReset = () => {
  reset(); // 清除 data、error、status 等
};
```

## 全局 Mutation 配置

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      onError: (error) => {
        // 全局错误处理器
        console.error('Mutation 错误:', error);
      }
    }
  }
});
```

## Mutation 生命周期

```
┌─────────────┐
│ idle        │
└──────┬──────┘
       │ mutate()
       ▼
┌─────────────┐
│ pending     │ ─── onMutate()
└──────┬──────┘
       │
       ├─ success ──► onSuccess() ──┐
       │                            │
       └─ error ────► onError() ────┤
                                    │
                                    ▼
                              onSettled()
```

## 最佳实践

1. **使用乐观更新** - 快速操作获得更好的 UX
2. **始终处理错误** - 显示清晰的错误信息
3. **失效相关 Queries** - 保持缓存同步
4. **使用 onSettled** - 无论成功/错误都执行清理
5. **卸载时重置** - 组件卸载时清除 mutation 状态
6. **网络错误重试** - 配置重试以处理临时故障
7. **显示加载状态** - mutation 期间禁用按钮
8. **错误时回滚** - mutation 失败时恢复乐观更新

## 常见模式

### 创建后跳转

```typescript
const { mutate } = useMutation({
  mutationFn: createPost,
  onSuccess: (newPost) => {
    navigate(`/posts/${newPost.id}`);
  }
});
```

### 更新后 Toast

```typescript
const { mutate } = useMutation({
  mutationFn: updatePost,
  onSuccess: () => {
    toast.success('帖子已更新!');
  },
  onError: () => {
    toast.error('更新帖子失败');
  }
});
```

### 删除前确认

```typescript
const { mutate } = useMutation({
  mutationFn: deletePost,
  onMutate: async () => {
    const confirmed = await confirm('确定要删除吗？');
    if (!confirmed) throw new Error('已取消');
  },
  onSuccess: () => {
    toast.success('帖子已删除');
    navigate('/posts');
  }
});
```
