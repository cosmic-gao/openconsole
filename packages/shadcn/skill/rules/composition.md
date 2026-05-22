# 组件组合

## 目录

- Item 一定在自己的 Group 里
- 提示框用 `Alert`
- 空状态用 `Empty`
- Toast 用 sonner
- 在不同 overlay 之间选
- `Dialog` / `Sheet` / `Drawer` 一定要有 Title
- `Card` 用完整组合
- `Button` 没有 `isPending` / `isLoading` prop
- `TabsTrigger` 必须在 `TabsList` 里
- `Avatar` 必须带 `AvatarFallback`
- 用组件，别堆裸标签

---

## Item 一定在自己的 Group 里

**永远不要**把 Item 直接渲染在 content 容器里。

**Incorrect:**

```tsx
<SelectContent>
  <SelectItem value="apple">Apple</SelectItem>
  <SelectItem value="banana">Banana</SelectItem>
</SelectContent>
```

**Correct:**

```tsx
<SelectContent>
  <SelectGroup>
    <SelectItem value="apple">Apple</SelectItem>
    <SelectItem value="banana">Banana</SelectItem>
  </SelectGroup>
</SelectContent>
```

适用于所有基于 group 的组件:

| Item | Group |
|---|---|
| `SelectItem`、`SelectLabel` | `SelectGroup` |
| `DropdownMenuItem`、`DropdownMenuLabel`、`DropdownMenuSub` | `DropdownMenuGroup` |
| `MenubarItem` | `MenubarGroup` |
| `ContextMenuItem` | `ContextMenuGroup` |
| `CommandItem` | `CommandGroup` |

---

## 提示框用 `Alert`

```tsx
import { Alert, AlertTitle, AlertDescription } from "@opendesign/shadcn";

<Alert>
  <AlertTitle>Warning</AlertTitle>
  <AlertDescription>Something needs attention.</AlertDescription>
</Alert>
```

---

## 空状态用 `Empty`

```tsx
import {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent,
  Button,
} from "@opendesign/shadcn";

<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><FolderIcon /></EmptyMedia>
    <EmptyTitle>No projects yet</EmptyTitle>
    <EmptyDescription>Get started by creating a new project.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>Create Project</Button>
  </EmptyContent>
</Empty>
```

---

## Toast 用 sonner

`toast()` 从 sonner 直接导入，不在本包里:

```tsx
import { toast } from "sonner";

toast.success("Changes saved.");
toast.error("Something went wrong.");
toast("File deleted.", {
  action: { label: "Undo", onClick: () => undoDelete() },
});
```

在 app 根上挂一次本包的 `<Toaster />`:

```tsx
import { Toaster } from "@opendesign/shadcn";

// app/layout.tsx
<body>
  {children}
  <Toaster />
</body>
```

`Toaster` 默认带 success / info / warning / error / loading 五种状态图标
和适配主题的颜色 —— 不用再传 `theme` 或 `icons`。

---

## 在不同 overlay 之间选

| 场景 | 用什么 |
|---|---|
| 需要输入的聚焦任务 | `Dialog` |
| 破坏性操作的二次确认 | `AlertDialog` |
| 带详情或筛选的侧拉面板 | `Sheet` |
| 移动端优先的底部面板 | `Drawer` |
| 悬浮时的快速信息 | `HoverCard` |
| 点击触发的小块上下文内容 | `Popover` |

---

## `Dialog` / `Sheet` / `Drawer` 一定要有 Title

`DialogTitle`、`SheetTitle`、`DrawerTitle` 对屏幕阅读器是必需的。
视觉上不想显示就 `className="sr-only"`。

```tsx
<DialogContent>
  <DialogHeader>
    <DialogTitle>Edit Profile</DialogTitle>
    <DialogDescription>Update your profile.</DialogDescription>
  </DialogHeader>
  ...
</DialogContent>
```

不需要可见 header 的也要带:

```tsx
<DialogContent>
  <DialogTitle className="sr-only">Settings</DialogTitle>
  {/* … */}
</DialogContent>
```

---

## `Card` 用完整组合

**永远不要**把所有东西塞到 `CardContent` 里:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Team Members</CardTitle>
    <CardDescription>Manage your team.</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>
    <Button>Invite</Button>
  </CardFooter>
</Card>
```

---

## `Button` 没有 `isPending` / `isLoading` prop

用 `Spinner` + `data-icon` + `disabled` 拼:

```tsx
import { Button, Spinner } from "@opendesign/shadcn";

<Button disabled>
  <Spinner data-icon="inline-start" />
  Saving...
</Button>
```

带 mutation hook 时:

```tsx
<Button disabled={mutation.isPending}>
  {mutation.isPending && <Spinner data-icon="inline-start" />}
  Save
</Button>
```

---

## `TabsTrigger` 必须在 `TabsList` 里

**永远不要**把 `TabsTrigger` 直接渲染在 `Tabs` 里 —— 一定包在 `TabsList`:

```tsx
<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="password">Password</TabsTrigger>
  </TabsList>
  <TabsContent value="account">...</TabsContent>
</Tabs>
```

---

## `Avatar` 必须带 `AvatarFallback`

图片加载失败的兜底，必须有:

```tsx
<Avatar>
  <AvatarImage src="/avatar.png" alt="User" />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>
```

---

## 用组件，别堆裸标签

| 不要 | 改用 |
|---|---|
| `<hr>` 或 `<div className="border-t">` | `<Separator />` |
| `<div className="animate-pulse">` 加样式 | `<Skeleton className="h-4 w-3/4" />` |
| `<span className="rounded-full bg-green-100 …">` | `<Badge variant="secondary">` |
| 自己写 CSS 转圈 | `<Spinner />` |
| 自己加 `<kbd>` 样式 | `<Kbd>` |
