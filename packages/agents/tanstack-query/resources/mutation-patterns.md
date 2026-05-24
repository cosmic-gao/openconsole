# 复杂 Mutation 模式

## 基础 Mutations

```typescript
import { useMutation } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'

const { mutate, isPending, isError, error } = useMutation({
  mutationFn: post.create,
  onSuccess: (data) => {
    console.log('帖子已创建:', data)
  },
  onError: (error) => {
    console.error('创建帖子失败:', error)
  }
})

mutate({ title: '新帖子', content: '...' })
```

## 乐观更新

立即更新 UI，错误时回滚：

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'

const { mutate } = useMutation({
  mutationFn: post.update,
  onMutate: async (newPost) => {
    await queryClient.cancelQueries({ queryKey: ['post'] })
    const previousPosts = queryClient.getQueryData(['post', 'list'])
    queryClient.setQueryData(['post', 'list'], (old) =>
      old.map((p) => (p.id === newPost.id ? newPost : p))
    )
    return { previousPosts }
  },
  onError: (err, newPost, context) => {
    queryClient.setQueryData(['post', 'list'], context.previousPosts)
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['post'] })
  }
})
```

## 顺序 Mutations

按顺序执行 mutations：

```typescript
const createAndPublish = async (postData) => {
  const newPost = await createPostMutation.mutateAsync(postData)
  const published = await publishPostMutation.mutateAsync(newPost.id)
  return published
}
```

## 并行 Mutations

同时执行多个 mutations：

```typescript
import { useMutation } from '@tanstack/react-query'
import { user, settings } from '@/features/settings/api'

const { mutate } = useMutation({
  mutationFn: async (updates) => {
    const results = await Promise.all([
      user.updateProfile(updates.profile),
      settings.update(updates.settings),
    ])
    return results
  }
})
```

## 带失效的 Mutation

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'

const { mutate } = useMutation({
  mutationFn: post.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['post'] })
    queryClient.setQueryData(['post', 'list'], (old = []) => [newPost, ...old])
  }
})
```

## 多缓存更新

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'

const { mutate } = useMutation({
  mutationFn: post.delete,
  onSuccess: (_, deletedId) => {
    queryClient.setQueryData(['post', 'list'], (old) => old.filter((p) => p.id !== deletedId))
    queryClient.invalidateQueries({ queryKey: ['stats'] })
  }
})
```

## 错误处理

```typescript
import { useMutation } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'

const { mutate, isError, error, reset } = useMutation({
  mutationFn: post.create,
  onError: (error) => {
    if (error.code === 'VALIDATION_ERROR') {
      setFormErrors(error.fields)
    } else if (error.code === 'NETWORK_ERROR') {
      showRetryDialog()
    } else {
      showGenericError()
    }
  }
})

reset()
```

## 重试失败的 Mutations

```typescript
import { useMutation } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'

const { mutate } = useMutation({
  mutationFn: post.create,
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
})
```

## 带加载状态的 Mutation

```typescript
import { useMutation } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'

function CreatePostForm() {
  const { mutate, isPending } = useMutation({
    mutationFn: post.create,
    onSuccess: () => navigate('/post')
  })

  const handleSubmit = (data) => mutate(data)

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit" disabled={isPending}>
        {isPending ? '创建中...' : '创建帖子'}
      </button>
    </form>
  )
}
```

## 带变量的 Mutation

```typescript
import { useMutation } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'

const { mutate, variables } = useMutation({
  mutationFn: post.update
})

console.log('上次更新的帖子:', variables)
```

## Mutation 回调

```typescript
import { useMutation } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'

const { mutate } = useMutation({
  mutationFn: post.create,
  onMutate: (variables) => console.log('开始 mutation:', variables),
  onSuccess: (data) => console.log('成功!', data),
  onError: (error) => console.error('错误!', error),
  onSettled: () => console.log('Mutation 完成')
})
```

## 带表单集成的 Mutation

```typescript
import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'
import { toast } from 'sonner'

function CreatePostForm() {
  const { register, handleSubmit, reset } = useForm()

  const { mutate, isPending, isError, error } = useMutation({
    mutationFn: post.create,
    onSuccess: () => {
      reset()
      toast.success('帖子已创建!')
    },
    onError: (error) => toast.error(error.message)
  })

  const onSubmit = (data) => mutate(data)

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('title')} />
      <textarea {...register('content')} />
      <button type="submit" disabled={isPending}>提交</button>
      {isError && <ErrorMessage error={error} />}
    </form>
  )
}
```

## Mutation 状态重置

```typescript
import { useMutation } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'

const { mutate, data, error, reset } = useMutation({
  mutationFn: post.create
})

const handleReset = () => reset()
```

## 全局 Mutation 配置

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      onError: (error) => console.error('Mutation 错误:', error)
    }
  }
})
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
import { useMutation } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'
import { useNavigate } from 'next/navigation'

const navigate = useNavigate()

const { mutate } = useMutation({
  mutationFn: post.create,
  onSuccess: (newPost) => navigate(`/post/${newPost.id}`)
})
```

### 更新后 Toast

```typescript
import { useMutation } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'
import { toast } from 'sonner'

const { mutate } = useMutation({
  mutationFn: post.update,
  onSuccess: () => toast.success('帖子已更新!'),
  onError: () => toast.error('更新帖子失败')
})
```

### 删除前确认

```typescript
import { useMutation } from '@tanstack/react-query'
import { post } from '@/features/post/api/post'
import { toast } from 'sonner'

const { mutate } = useMutation({
  mutationFn: post.delete,
  onMutate: async () => {
    const confirmed = await confirm('确定要删除吗？')
    if (!confirmed) throw new Error('已取消')
  },
  onSuccess: () => {
    toast.success('帖子已删除')
    navigate('/post')
  }
})
```
