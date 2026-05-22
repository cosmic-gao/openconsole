# 主题化 & 定制

组件引用语义化的 CSS 变量。改变量就等于改所有组件。

## 目录

- 工作原理（CSS 变量 → Tailwind 工具类 → 组件）
- 颜色变量与 OKLCH 格式
- 暗色模式配置
- 切主题（编辑全局 CSS 或粘 CSS）
- 新增自定义色（Tailwind v4）
- 圆角 `--radius`
- view-transition 变量（圆形展开切主题）
- 定制组件的边界（只能从外面来）

---

## 工作原理

1. CSS 变量定义在 `:root`（亮）和 `.dark`（暗）。
2. Tailwind v4 把它们映射成工具类: `bg-primary`、`text-muted-foreground` 等。
3. 组件用这些工具类 —— **改一个变量，所有引用它的组件全跟着变**。

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

通过根元素上的 `.dark` 类切换。用 `next-themes` 的 `ThemeProvider`
包根:

```tsx
"use client";
import { ThemeProvider } from "next-themes";

// app/layout.tsx 或类似根布局
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  {children}
</ThemeProvider>
```

主题切换按钮自己写一个，调用 `useTheme()`:

```tsx
"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@openconsole/shadcn";

export function ThemeToggle() {
  // 用 resolvedTheme，处于 System 模式时也能正确翻转。
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">切换主题</span>
    </Button>
  );
}
```

---

## 切主题

### 直接编辑全局 CSS

如果要永久换主题色，找到 app 的全局 CSS 文件（一般是
`app/globals.css`）直接改 `:root` / `.dark` 块。修改后所有组件自动
跟着变。

### 粘 CSS 主题

从 <https://ui.shadcn.com/themes> 或 <https://tweakcn.com> 复制出来
的 `:root { … } .dark { … }` 直接粘到全局 CSS 文件覆盖现有的同名
变量即可。

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

---

## 圆角

`--radius` 全局控制圆角。组件从它派生:

| 工具类 | 等价值 |
|---|---|
| `rounded-lg` | `var(--radius)` |
| `rounded-md` | `calc(var(--radius) - 2px)` |
| `rounded-sm` | `calc(var(--radius) - 4px)` |

要在运行时调圆角，直接 `document.documentElement.style.setProperty("--radius", "0.75rem")`。

---

## View-transition 变量（圆形展开切主题）

切主题时想要从点击位置圆形展开的过渡动画，用 View Transitions API +
CSS 变量做。给全局 CSS 加:

```css
@supports (view-transition-name: root) {
  ::view-transition-new(root) {
    clip-path: circle(0% at var(--vt-origin-x, 50%) var(--vt-origin-y, 50%));
    animation: vt-circle-in 350ms ease-out forwards;
  }
  @keyframes vt-circle-in {
    to { clip-path: circle(150% at var(--vt-origin-x, 50%) var(--vt-origin-y, 50%)); }
  }
}
```

切换按钮里在点击时设置原点变量并启动 transition:

```tsx
"use client";
import { useTheme } from "next-themes";
import { Button } from "@openconsole/shadcn";

type TransitionDocument = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const onToggle = (e: React.MouseEvent) => {
    const root = document.documentElement;
    root.style.setProperty("--vt-origin-x", `${(e.clientX / window.innerWidth) * 100}%`);
    root.style.setProperty("--vt-origin-y", `${(e.clientY / window.innerHeight) * 100}%`);
    const next = resolvedTheme === "dark" ? "light" : "dark";
    const doc = document as TransitionDocument;
    if (doc.startViewTransition) {
      doc.startViewTransition(() => setTheme(next));
    } else {
      setTheme(next);
    }
  };

  return <Button variant="outline" size="icon" onClick={onToggle}>…</Button>;
}
```

> 变量名用 `--vt-origin-x` / `--vt-origin-y` 而不是 `--x` / `--y` ——
> 太通用的名字容易跟其他库的临时变量冲突。

---

## 定制组件的边界

`@openconsole/shadcn` 是只读消费包 —— 你**不能**改组件源码加 variant、
不能 fork 文件、不能 patch。能做的就是从外面调整:

### 1. 内置 variant（优先）

```tsx
<Button variant="outline" size="sm">Click</Button>
```

`Button` variant: `default` / `secondary` / `outline` / `ghost` /
`destructive` / `link`。`Badge` variant: `default` / `secondary` /
`destructive` / `outline`。其它原语的 variant hover 上去看 IDE 提示。

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
} from "@openconsole/shadcn";

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
