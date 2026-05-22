# 主题化 & 定制

组件引用语义化的 CSS 变量。改变量就等于改所有组件。

## 目录

- 工作原理（CSS 变量 → Tailwind 工具类 → 组件）
- 颜色变量与 OKLCH 格式
- 暗色模式配置
- 切主题（用 `@opendesign/atoms` 的 `Preferences` / `Appearance`）
- 新增自定义色（Tailwind v4）
- 圆角 `--radius`
- view-transition 变量
- 定制组件的边界（只能从外面来）

---

## 工作原理

1. CSS 变量定义在 `:root`（亮）和 `.dark`（暗）。
2. Tailwind v4 把它们映射成工具类: `bg-primary`、`text-muted-foreground` 等。
3. 组件用这些工具类 —— **改一个变量，所有引用它的组件全跟着变**。

> Tailwind 版本: 本仓库统一用 **v4**。所有示例都以 v4 为准。

---

## 颜色变量

每种颜色都遵循 `name` / `name-foreground` 约定。基础变量给背景用，
`-foreground` 给该背景上的文字 / 图标用。

| 变量 | 用途 |
|---|---|
| `--background` / `--foreground` | 页面背景与默认文字 |
| `--card` / `--card-foreground` | 卡片表面 |
| `--primary` / `--primary-foreground` | 主按钮与主操作 |
| `--secondary` / `--secondary-foreground` | 次要操作 |
| `--muted` / `--muted-foreground` | 弱化 / 禁用状态 |
| `--accent` / `--accent-foreground` | 悬浮与点缀 |
| `--destructive` / `--destructive-foreground` | 错误与破坏性操作 |
| `--border` | 默认边框 |
| `--input` | 表单输入边框 |
| `--ring` | 焦点环 |
| `--chart-1` 到 `--chart-5` | 图表 / 可视化 |
| `--sidebar-*` | 侧边栏专用色 |
| `--surface` / `--surface-foreground` | 次级表面 |

颜色用 **OKLCH**: `--primary: oklch(0.205 0 0)`。三个值依次是 lightness
（0–1）、chroma（0 表示灰）、hue（0–360）。

---

## 暗色模式

通过根元素上的 `.dark` 类切换。我们用 `next-themes`，包装在
`@opendesign/atoms` 的 `ThemeProvider`:

```tsx
import { ThemeProvider } from "@opendesign/atoms";

<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  {children}
</ThemeProvider>
```

主题切换按钮直接用 atoms 的 `Appearance` 组件 —— 它内置 view-transition
圆形展开动画，并且正确读 `resolvedTheme`（处理 System 模式）:

```tsx
import { Appearance } from "@opendesign/atoms";

<Appearance />
```

---

## 切主题

三种合规做法:

### A. 用 `Preferences` 组件（推荐）

`@opendesign/atoms` 暴露一个完整的设置抽屉，自带主题预设、调色板、
布局、CSS 导入:

```tsx
import { Preferences } from "@opendesign/atoms";

const [open, setOpen] = useState(false);
<Preferences open={open} onOpenChange={setOpen} />
```

### B. 粘 CSS 到导入器

用户从 <https://ui.shadcn.com/themes> 或 <https://tweakcn.com> 复制
出来的 `:root { … } .dark { … }` 直接粘进 `Preferences` 的 Importer
tab，自动解析 + 应用。

### C. 直接编辑全局 CSS

如果你只是想永久换主题色，找到 app 的全局 CSS 文件（一般是
`app/globals.css`）直接改 `:root` / `.dark` 块。

---

## 新增自定义色

不要新建 CSS 文件 —— 加到 app 的全局 CSS 文件里。

```css
/* 1. 在全局 CSS 文件里定义。 */
:root {
  --warning: oklch(0.84 0.16 84);
  --warning-foreground: oklch(0.28 0.07 46);
}
.dark {
  --warning: oklch(0.41 0.11 46);
  --warning-foreground: oklch(0.99 0.02 95);
}

/* 2. 用 Tailwind v4 的 @theme inline 注册成工具类。 */
@theme inline {
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
}
```

```tsx
// 3. 在组件里用。
<div className="bg-warning text-warning-foreground">Warning</div>
```

> 不支持 Tailwind v3。如果在 v3 项目里遇到本包，先把项目升到 v4。

---

## 圆角

`--radius` 全局控制圆角。组件从它派生:

| 工具类 | 等价值 |
|---|---|
| `rounded-lg` | `var(--radius)` |
| `rounded-md` | `calc(var(--radius) - 2px)` |
| `rounded-sm` | `calc(var(--radius) - 4px)` |

`Preferences` 组件的 Layout tab 提供圆角滑块。

---

## View-transition 变量

主题切换的圆形展开动画依赖两个变量:

```css
::view-transition-new(root) {
  clip-path: circle(150% at var(--vt-origin-x, 50%) var(--vt-origin-y, 50%));
}
```

`Appearance` 组件 / `useViewTransition()` 钩子会在点击时设置这两个变量
为鼠标坐标的百分比。这套已经在 atoms 里处理好了 —— 你自己要做主题切换
按钮时**也用这两个变量名**，避免跟其他库的临时变量冲突。

---

## 定制组件的边界

`@opendesign/shadcn` 是只读消费包 —— 你**不能**改组件源码加 variant、
不能 fork 文件、不能 patch。能做的就是从外面调整:

### 1. 内置 variant（优先）

```tsx
<Button variant="outline" size="sm">Click</Button>
```

`Button` variant: `default` / `secondary` / `outline` / `ghost` /
`destructive` / `link`。`Badge` variant: `default` / `secondary` /
`destructive` / `outline`。其它原语的 variant 翻 `index.ts` 导出的类型
（或者 hover 上去看 IDE 提示）。

### 2. `className` 加 Tailwind 类（仅布局）

```tsx
<Card className="mx-auto max-w-md">…</Card>
```

**不要**用 `className` 覆盖颜色或排版 —— 改主题变量。

### 3. CSS 变量（颜色 / 圆角 / 字体）

见上面 [新增自定义色](#新增自定义色) 和 [圆角](#圆角)。

### 4. wrapper 组件（应用层抽象）

应用里要 `ConfirmDialog`、`PageHeader`、`Toolbar` 这种复合形态，在自己
的应用代码里拼:

```tsx
// 在你的应用代码里
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent,
  AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@opendesign/shadcn";

export function ConfirmDialog({ title, description, onConfirm, children }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

如果你发现 wrapper 的需求在多个项目里反复出现，应该把它推到
`@opendesign/atoms` —— 那个包就是专门干这个的。
