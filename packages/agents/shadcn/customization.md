# 主题适配

组件通过语义 CSS 变量 token 引用样式。更改变量即更改所有引用组件。

## 目录

- 工作原理（CSS 变量 → Tailwind utilities → 组件）
- Color Token
- 亮色 / 深色模式
- 语义 Color Token 的使用
- 适配主题的正确方式

---

## 工作原理

1. CSS 变量在 `:root`（浅色）和 `.dark`（深色模式）中定义
2. Tailwind 将它们映射到 utilities：`bg-primary`、`text-muted-foreground` 等
3. 组件使用这些 utilities — 更改变量会更改所有引用它的组件

---

## Color Token

每个颜色遵循 `name` / `name-foreground` 约定。基础变量用于背景，`-foreground` 用于该背景上的文本/图标。

| Token | 用途 |
| --- | --- |
| `--background` / `--foreground` | 页面背景和默认文本 |
| `--card` / `--card-foreground` | Card 表面 |
| `--primary` / `--primary-foreground` | 主要按钮和操作 |
| `--secondary` / `--secondary-foreground` | 次要操作 |
| `--muted` / `--muted-foreground` | 静音/禁用状态 |
| `--accent` / `--accent-foreground` | 悬停和强调状态 |
| `--destructive` / `--destructive-foreground` | 错误和破坏性操作 |
| `--border` | 默认边框颜色 |
| `--input` | 表单输入边框 |
| `--ring` | 焦点环颜色 |
| `--chart-1` 到 `--chart-5` | 图表/数据可视化 |
| `--sidebar-*` | 侧边栏专用颜色 |
| `--surface` / `--surface-foreground` | 次要表面 |

颜色使用 OKLCH：`--primary: oklch(0.205 0 0)`，值是 lightness（0-1）、chroma（0 = 灰色）和 hue（0-360）。

---

## 亮色 / 深色模式

亮色/深色切换通过根元素上的 `.dark` class 实现。在 Next.js 中使用 `ThemeProvider`：

```tsx
import { ThemeProvider } from '@openconsole/atoms'

<ThemeProvider>{children}</ThemeProvider>
```

`ThemeProvider` 是 `next-themes` `ThemeProvider` 的薄封装。

---

## 语义 Color Token 的使用

### 使用语义 token，不使用原始颜色

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

### 状态颜色使用 Badge 或语义 token

**错误：**

```tsx
<span className="text-emerald-600">+20.1%</span>
<span className="text-green-500">活跃</span>
<span className="text-red-600">-3.2%</span>
```

**正确：**

```tsx
<Badge variant="secondary">+20.1%</Badge>
<Badge>活跃</Badge>
<span className="text-destructive">-3.2%</span>
```

### 深色模式覆盖

使用语义 token，它们通过 CSS 变量自动处理亮色/深色切换。

**错误：**

```tsx
<div className="bg-white dark:bg-gray-950">
  <p className="text-gray-600 dark:text-gray-400">文本</p>
</div>
```

**正确：**

```tsx
<div className="bg-background">
  <p className="text-muted-foreground">文本</p>
</div>
```

---

## 适配主题的正确方式

### 1. 使用内置 Variants

```tsx
<Button variant="outline" size="sm">点击</Button>
```

### 2. 通过 className 添加布局样式

```tsx
<Card className="max-w-md mx-auto">...</Card>
```

### 3. 全局 CSS 变量（在 app/globals.css 中定义）

```css
:root {
  --primary: oklch(0.55 0.18 235);
  --background: oklch(0.98 0.01 235);
}
.dark {
  --primary: oklch(0.55 0.18 235);
  --background: oklch(0.15 0.01 235);
}
```

### 4. 组件特定的 CSS 变量

某些组件支持 CSS 变量来自定义：

```tsx
<Card style={{ '--card-bg': 'var(--primary)' }}>...</Card>
```

---

## 常见错误

### 错误 1：使用原始颜色值

```tsx
// 错误
<div className="bg-blue-500 text-white">内容</div>

// 正确
<div className="bg-primary text-primary-foreground">内容</div>
```

### 错误 2：手动 dark: 覆盖

```tsx
// 错误
<div className="bg-white dark:bg-gray-900">内容</div>

// 正确
<div className="bg-background">内容</div>
```

### 错误 3：在 className 中硬编码颜色逻辑

```tsx
// 错误
<div className={isActive ? "bg-blue-100" : "bg-gray-100"}>

// 正确
<div className={isActive ? "bg-accent" : "bg-muted"}>
```
