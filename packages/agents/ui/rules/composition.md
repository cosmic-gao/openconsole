# 组件组合

## 目录

- 项必须在 Group 组件内
- Callout 使用 Alert
- 空状态使用 Empty 组件
- Toast 通知使用 sonner
- 选择覆盖层组件
- Dialog、Sheet、Drawer 必须有 Title
- Card 结构
- Button 没有 isPending 或 isLoading 属性
- TabsTrigger 必须在 TabsList 内
- Avatar 必须有 AvatarFallback
- 使用 Separator 代替 raw hr 或 border div
- 使用 Skeleton 作为加载占位符
- 使用 Badge 代替自定义样式 span

---

## 项必须在 Group 组件内

不要直接将项渲染在内容容器内。

**错误：**

```tsx
<SelectContent>
  <SelectItem value="apple">Apple</SelectItem>
  <SelectItem value="banana">Banana</SelectItem>
</SelectContent>
```

**正确：**

```tsx
<SelectContent>
  <SelectGroup>
    <SelectItem value="apple">Apple</SelectItem>
    <SelectItem value="banana">Banana</SelectItem>
  </SelectGroup>
</SelectContent>
```

所有基于 Group 的组件：

| 项 | Group |
| --- | --- |
| `SelectItem`, `SelectLabel` | `SelectGroup` |
| `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSub` | `DropdownMenuGroup` |
| `MenubarItem` | `MenubarGroup` |
| `ContextMenuItem` | `ContextMenuGroup` |
| `CommandItem` | `CommandGroup` |

---

## Callout 使用 Alert

```tsx
<Alert>
  <AlertTitle>警告</AlertTitle>
  <AlertDescription>需要注意的事项。</AlertDescription>
</Alert>
```

---

## 空状态使用 Empty 组件

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon">
      <FolderIcon />
    </EmptyMedia>
    <EmptyTitle>暂无项目</EmptyTitle>
    <EmptyDescription>创建新项目开始。</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>创建项目</Button>
  </EmptyContent>
</Empty>
```

---

## Toast 通知使用 sonner

```tsx
import { toast } from 'sonner'

toast.success('更改已保存。')
toast.error('出错了。')
toast('文件已删除。', {
  action: { label: '撤销', onClick: () => undoDelete() }
})
```

---

## 选择覆盖层组件

| 使用场景 | 组件 |
| --- | --- |
| 需要输入的专注任务 | `Dialog` |
| 破坏性操作确认 | `AlertDialog` |
| 带有详情或过滤器的侧边面板 | `Sheet` |
| 移动端优先底部面板 | `Drawer` |
| 悬停时显示快速信息 | `HoverCard` |
| 点击显示小上下文内容 | `Popover` |

---

## Dialog、Sheet、Drawer 必须有 Title

`DialogTitle`、`SheetTitle`、`DrawerTitle` 是可访问性必需的。使用 `className="sr-only"` 视觉隐藏。

```tsx
<DialogContent>
  <DialogHeader>
    <DialogTitle>编辑资料</DialogTitle>
    <DialogDescription>更新您的个人资料。</DialogDescription>
  </DialogHeader>
  ...
</DialogContent>
```

---

## Card 结构

使用完整组合，不要将所有内容放入 `CardContent`：

```tsx
<Card>
  <CardHeader>
    <CardTitle>团队成员</CardTitle>
    <CardDescription>管理您的团队。</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>
    <Button>邀请</Button>
  </CardFooter>
</Card>
```

---

## Button 没有 isPending 或 isLoading 属性

组合 `Spinner` + `data-icon` + `disabled`：

```tsx
<Button disabled>
  <Spinner data-icon="inline-start" />
  保存中...
</Button>
```

---

## TabsTrigger 必须在 TabsList 内

不要直接将 `TabsTrigger` 渲染在 `Tabs` 内，始终包装在 `TabsList` 中：

```tsx
<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">账户</TabsTrigger>
    <TabsTrigger value="password">密码</TabsTrigger>
  </TabsList>
  <TabsContent value="account">...</TabsContent>
</Tabs>
```

---

## Avatar 必须有 AvatarFallback

图片加载失败时需要 `AvatarFallback`：

```tsx
<Avatar>
  <AvatarImage src="/avatar.png" alt="用户" />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>
```

---

## 使用现有组件代替自定义标记

| 代替 | 使用 |
| --- | --- |
| `<hr>` 或 `<div className="border-t">` | `<Separator />` |
| `<div className="animate-pulse">` + 样式化 divs | `<Skeleton className="h-4 w-3/4" />` |
| `<span className="rounded-full bg-green-100 ...">` | `<Badge variant="secondary">` |

atoms vs primitives 边界详见 [foundation.md](./foundation.md)。
