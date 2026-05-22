# 样式 & 定制

主题 / CSS 变量 / 自定义色见 [customization.md](../customization.md)。
这份文件全是 Incorrect / Correct 对照，方便快速识别和修复违例。

## 目录

- 语义色
- 状态色不要裸值
- 内置 variant 优先
- `className` 只管布局
- 不要 `space-x-*` / `space-y-*`
- 宽高相等用 `size-*`
- `truncate` 简写
- 不要手写 `dark:` 颜色覆盖
- `cn()` 用于条件 class
- overlay 不要手写 z-index

---

## 语义色

**Incorrect:**

```tsx
<div className="bg-blue-500 text-white">
  <p className="text-gray-600">Secondary text</p>
</div>
```

**Correct:**

```tsx
<div className="bg-primary text-primary-foreground">
  <p className="text-muted-foreground">Secondary text</p>
</div>
```

---

## 状态色不要裸值

正面、负面、状态指示要么用 `Badge` variant，要么用语义 token
（`text-destructive` 等），要么定义自定义 CSS 变量 —— **不要**裸用
Tailwind 调色板。

**Incorrect:**

```tsx
<span className="text-emerald-600">+20.1%</span>
<span className="text-green-500">Active</span>
<span className="text-red-600">-3.2%</span>
```

**Correct:**

```tsx
<Badge variant="secondary">+20.1%</Badge>
<Badge>Active</Badge>
<span className="text-destructive">-3.2%</span>
```

需要 success / positive 色但没有对应语义 token? 用 `Badge` variant，
或者按 [customization.md —— 新增自定义色](../customization.md#新增自定义色)
加一个 `--success` 变量。

---

## 内置 variant 优先

**Incorrect:**

```tsx
<Button className="border border-input bg-transparent hover:bg-accent">
  Click me
</Button>
```

**Correct:**

```tsx
<Button variant="outline">Click me</Button>
```

`Button` variant: `default` / `secondary` / `outline` / `ghost` /
`destructive` / `link`。`Badge` variant: `default` / `secondary` /
`destructive` / `outline`。其它原语自行查 source。

---

## `className` 只管布局

`className` 用来加布局类（`max-w-md`、`mx-auto`、`mt-4`），**不要**
覆盖组件颜色或排版。改色用语义 token、内置 variant、或 CSS 变量。

**Incorrect:**

```tsx
<Card className="bg-blue-100 text-blue-900 font-bold">
  <CardContent>Dashboard</CardContent>
</Card>
```

**Correct:**

```tsx
<Card className="max-w-md mx-auto">
  <CardContent>Dashboard</CardContent>
</Card>
```

定制顺序:
1. **内置 variant** —— `variant="outline"`、`variant="destructive"`…
2. **语义 token** —— `bg-primary`、`text-muted-foreground`。
3. **CSS 变量** —— 加到全局 CSS（见
   [customization.md](../customization.md)）。

---

## 不要 `space-x-*` / `space-y-*`

改用 `gap-*`。`space-y-4` → `flex flex-col gap-4`。`space-x-2` → `flex gap-2`。

```tsx
<div className="flex flex-col gap-4">
  <Input />
  <Input />
  <Button>Submit</Button>
</div>
```

---

## 宽高相等用 `size-*`

`size-10` 不是 `w-10 h-10`。适用于图标、头像、骨架屏、按钮等。

---

## `truncate` 简写

`truncate` 不是 `overflow-hidden text-ellipsis whitespace-nowrap`。

---

## 不要手写 `dark:` 颜色覆盖

语义 token 通过 CSS 变量自动处理亮 / 暗 —— `bg-background text-foreground`
不是 `bg-white dark:bg-gray-950`。

---

## `cn()` 用于条件 class

从 `@openclound/shadcn` 导入 `cn()` 来拼条件或合并的 class，**不要**在
`className` 字符串里手写模板字面量的三元。

**Incorrect:**

```tsx
<div className={`flex items-center ${isActive ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
```

**Correct:**

```tsx
import { cn } from "@openclound/shadcn";

<div className={cn("flex items-center", isActive ? "bg-primary text-primary-foreground" : "bg-muted")}>
```

> 注意导入路径是 `@openclound/shadcn`，不是 `@/lib/utils`。

---

## overlay 不要手写 z-index

`Dialog`、`Sheet`、`Drawer`、`AlertDialog`、`DropdownMenu`、`Popover`、
`Tooltip`、`HoverCard` **自己管堆叠**。绝对不要加 `z-50` 或 `z-[999]` ——
这样会破坏它们跟 `Toaster` 之间的堆叠顺序。
