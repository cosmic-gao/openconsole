# 样式与 Tailwind

## 目录

- 语义颜色
- 不使用原始颜色值表示状态
- 优先使用内置 variants
- className 仅用于布局
- 禁止 space-x-_ / space-y-_
- 等宽高优先用 size-_
- 优先用 truncate 简写
- 禁止手动 dark: 颜色覆盖
- 使用 cn() 处理条件类
- 覆盖组件禁止手动 z-index

---

## 语义颜色

**错误：**

```tsx
<div className="bg-blue-500 text-white">
  <p className="text-gray-600">次要文本</p>
</div>
```

**正确：**

```tsx
<div className="bg-primary text-primary-foreground">
  <p className="text-muted-foreground">次要文本</p>
</div>
```

---

## 不使用原始颜色值表示状态

正数、负数或状态指示器使用 `Badge` variants、语义 token（如 `text-destructive`）或自定义 CSS 变量。

**错误：**

```tsx
<span className="text-emerald-600">+20.1%</span>
<span className="text-green-500">Active</span>
<span className="text-red-600">-3.2%</span>
```

**正确：**

```tsx
<Badge variant="secondary">+20.1%</Badge>
<Badge>Active</Badge>
<span className="text-destructive">-3.2%</span>
```

---

## 优先使用内置 variants

**错误：**

```tsx
<Button className="border border-input bg-transparent hover:bg-accent">点击</Button>
```

**正确：**

```tsx
<Button variant="outline">点击</Button>
```

---

## className 仅用于布局

使用 `className` 做布局（如 `max-w-md`、`mx-auto`、`mt-4`），**不要**用于覆盖组件颜色或字体。更改颜色使用语义 token、内置 variants 或 CSS 变量。

**错误：**

```tsx
<Card className="bg-blue-100 text-blue-900 font-bold">
  <CardContent>Dashboard</CardContent>
</Card>
```

**正确：**

```tsx
<Card className="max-w-md mx-auto">
  <CardContent>Dashboard</CardContent>
</Card>
```

自定义组件外观，按以下顺序：

1. **内置 variants** — `variant="outline"`、`variant="destructive"` 等
2. **语义 color token** — `bg-primary`、`text-muted-foreground`
3. **CSS 变量** — 在全局 CSS 文件中定义自定义颜色

---

## 禁止 space-x-_ / space-y-_

使用 `gap-*` 代替。`space-y-4` → `flex flex-col gap-4`、`space-x-2` → `flex gap-2`。

```tsx
<div className="flex flex-col gap-4">
  <Input />
  <Input />
  <Button>提交</Button>
</div>
```

---

## 等宽高优先用 size-_

`size-10` 而不是 `w-10 h-10`。适用于图标、头像、骨架屏等。

---

## 优先用 truncate 简写

`truncate` 不是 `overflow-hidden text-ellipsis whitespace-nowrap`。

---

## 禁止手动 dark: 颜色覆盖

使用语义 token — 它们通过 CSS 变量处理 light/dark。`bg-background text-foreground` 而不是 `bg-white dark:bg-gray-950`。

---

## 使用 cn() 处理条件类

使用 `cn()` 工具函数处理条件类或合并类名。不要在 className 字符串中写手动三元表达式。

**错误：**

```tsx
<div className={`flex items-center ${isActive ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
```

**正确：**

```tsx
import { cn } from '@openconsole/shadcn'

<div className={cn("flex items-center", isActive ? "bg-primary text-primary-foreground" : "bg-muted")}>
```

---

## 覆盖组件禁止手动 z-index

`Dialog`、`Sheet`、`Drawer`、`AlertDialog`、`DropdownMenu`、`Popover`、`Tooltip`、`HoverCard` 自行处理层叠。禁止添加 `z-50` 或 `z-[999]`。
