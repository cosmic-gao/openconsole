# Theme —— 主题 / 颜色 / 字体 / 布局

> 模板的视觉一致性来自三个层:**主题色由 `@openconsole/shadcn` 控制**、**字体由
> `app/layout.tsx` 注入**、**布局由 `@openconsole/atoms` 的 Provider 持久化**。
> 偏离任何一层都会破坏跨项目一致性。

---

## 主题色:`#17b3a3`(青绿)

### 定义在哪

`@openconsole/shadcn/styles.css` 中的 `--primary` CSS 变量(light / dark 双模一致):

```css
:root {
  --primary: oklch(0.7 0.12 183);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.7 0.12 183);
  --sidebar-primary: oklch(0.7 0.12 183);
  --sidebar-ring: oklch(0.7 0.12 183);
}

.dark {
  --primary: oklch(0.7 0.12 183);
  /* …双模一致 */
}
```

### 在项目里怎么用

**只通过 Tailwind semantic token 或 CSS 变量**:

```tsx
// ✅ 推荐 —— Tailwind 自动映射到 var(--primary)
<Button>Save</Button>                       // 主色按钮
<div className="text-primary">Heading</div>
<div className="bg-primary/10">subtle bg</div>
<a className="border-primary/40">link</a>

// ✅ 偶尔用变量(动态颜色场景)
<NextToploader color="var(--primary)" />

// ❌ 永远不要写 hex 字面量
<div className="text-[#17b3a3]">...</div>
<div style={{ color: "#17b3a3" }}>...</div>
```

### 想换品牌色?

**不要**在项目里覆盖 `--primary`。两种正确做法:

1. **想给单个项目换品牌**(罕见 —— 模板的意义就是统一):在项目 `app/globals.css` 里覆盖。但请慎重,失去跨项目一致性。

```css
/* app/globals.css */
@import "tailwindcss";
@import "@openconsole/shadcn/styles.css";
@import "@openconsole/atoms/styles.css";

:root {
  --primary: oklch(0.6 0.2 250);   /* 蓝色 */
  --ring: oklch(0.6 0.2 250);
  --sidebar-primary: oklch(0.6 0.2 250);
  --sidebar-ring: oklch(0.6 0.2 250);
}
.dark {
  --primary: oklch(0.6 0.2 250);
  /* …同步 */
}
```

2. **想给全公司换品牌**(更常见):去改 `@openconsole/shadcn/styles.css`,发新版本,所有项目升级。

### 已经默认对齐 primary 的 token

- `--primary` —— 按钮主色 / 文本主色
- `--ring` —— 聚焦环(`focus-visible:ring-ring`)
- `--sidebar-primary` —— 侧边栏 brand 块 / hover 高亮
- `--sidebar-ring` —— 侧边栏聚焦环

改了 `--primary` 这四个**都要同步**改。

---

## 字体:Geist / Inter / Manrope

### 注入方式

`app/layout.tsx` 通过 `next/font/google` 加载,产出 4 个 CSS 变量:

```tsx
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

<body className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${manrope.variable} antialiased`}>
```

`app/globals.css` 把它们映射到 Tailwind v4 token:

```css
@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-inter: var(--font-inter);
  --font-manrope: var(--font-manrope);
}
```

### 默认 Inter

`<html className="font-inter">` —— 默认整站走 Inter。

### 用户切换字体

通过 atoms 的 `<FontProvider>`(内部 `localStorage` + `<html>` class 切换),配合 `<head>` 内嵌脚本防闪烁。脚本在 `app/layout.tsx` 已经写好,**不要动**。

### 在代码里用

```tsx
<div className="font-mono">{code}</div>                           // Geist Mono
<h1 className="[font-family:var(--font-manrope)]">标题</h1>        // Manrope
```

### 加新字体

1. `app/layout.tsx` 用 `next/font/google` 加载,产出新 CSS 变量
2. `app/globals.css` `@theme inline` 加映射
3. 业务里用 `font-<name>` 或 `[font-family:var(--font-<name>)]`

**不要**:用 `<link rel="stylesheet">` 引入 Google Fonts —— 用 next/font 才有自动子集化 + 防 layout shift。

---

## 明暗主题:`next-themes` via `@openconsole/atoms`

### 接入

`app/layout.tsx` 用 atoms 的 `<ThemeProvider>`:

```tsx
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  disableTransitionOnChange
>
  {children}
</ThemeProvider>
```

这是 next-themes 的薄包装,默认值已经设好。

### 切换按钮

直接用 atoms 的 `<ThemeSwitch>` —— 内置 View Transitions API 圆形 reveal 动画。`<Header>` 已经渲染了它,通常不用手动放。

### 在代码里读

```tsx
"use client";
import { useTheme } from "next-themes";

const { theme, resolvedTheme, setTheme } = useTheme();
```

`resolvedTheme` 是真正生效的(`"light"` / `"dark"`),`theme` 可能是 `"system"`。

---

## 布局:`<LayoutProvider>` + `<SidebarProvider>`

### 持久化在 cookie

- `openconsole-layout` cookie:存 `LayoutConfig`(variant / collapsible / side)
- `sidebar_state` cookie:存侧边栏展开 / 收起

两个 cookie 都由 **atoms 的 async server Provider 在服务端读**,所以首屏渲染就是真实状态,**没有刷新闪烁**。

### 默认值

```ts
{
  variant: "inset",         // sidebar 主体内嵌 + 圆角
  collapsible: "icon",      // 折叠到只剩图标
  side: "left",             // 侧边栏在左
}
```

### 接入(`app/(dashboard)/layout.tsx`)

```tsx
import { LayoutProvider, SidebarProvider, Sidebar, Header } from "@openconsole/atoms";
import { SidebarInset } from "@openconsole/shadcn";

<LayoutProvider>
  <SidebarProvider>
    <Sidebar brand={...} menu={...} />
    <SidebarInset>
      <Header />
      {children}
    </SidebarInset>
  </SidebarProvider>
</LayoutProvider>
```

**禁止**:

- 自己写 `<ThemeProvider>` / `<SidebarProvider>`(atoms 的版本是 async server component,做了防闪烁的 cookie 读取)
- 从 `@openconsole/shadcn` 直接 `import { SidebarProvider }` —— shadcn 的版本不带 cookie 还原,会闪烁

### 用户改布局

`<Preferences>`(atoms 提供,`<Header>` 内置按钮打开)弹出抽屉,有「Layout」tab 可视化调整 variant / collapsible / side。改了会自动写 cookie。

### 在代码里读

```tsx
"use client";
import { useLayout } from "@openconsole/atoms";

const { config, updateConfig } = useLayout();
// config.variant / config.collapsible / config.side
updateConfig({ side: "right" });  // 部分合并 + 自动写 cookie
```

---

## 颜色 token 速查

| Tailwind class | CSS 变量 | 用途 |
| --- | --- | --- |
| `bg-background` / `text-foreground` | `--background` / `--foreground` | 页面底色与默认文字 |
| `bg-card` / `text-card-foreground` | `--card` / `--card-foreground` | 卡片 |
| `bg-popover` / `text-popover-foreground` | `--popover` / `--popover-foreground` | 浮层 / 下拉 |
| `bg-primary` / `text-primary-foreground` | `--primary` / `--primary-foreground` | 主色按钮 |
| `bg-secondary` / `text-secondary-foreground` | `--secondary` / `--secondary-foreground` | 次要 |
| `bg-muted` / `text-muted-foreground` | `--muted` / `--muted-foreground` | 弱化 / 占位 |
| `bg-accent` / `text-accent-foreground` | `--accent` / `--accent-foreground` | hover 高亮 |
| `bg-destructive` | `--destructive` | 危险操作 |
| `border-border` | `--border` | 默认边框 |
| `ring-ring` | `--ring` | 聚焦环 |
| `bg-sidebar` / `text-sidebar-foreground` | `--sidebar` / `--sidebar-foreground` | 侧边栏 |
| `bg-sidebar-primary` | `--sidebar-primary` | 侧边栏品牌块 |

**透明度变体**:`bg-primary/10`(10% 不透明度)、`text-foreground/60` 等。**优先**用这种语义化方案,而不是显式 hex + opacity。

---

## 圆角

CSS 变量:`--radius`(默认 `0.625rem`)。Tailwind 自动暴露 4 档:

- `rounded-sm` = `calc(var(--radius) - 4px)`
- `rounded-md` = `calc(var(--radius) - 2px)`
- `rounded-lg` = `var(--radius)`
- `rounded-xl` = `calc(var(--radius) + 4px)`

`<Preferences>` 抽屉允许用户调 `--radius`(在 Theme tab),改动写到 inline style。

---

## SVG / Icon 尺寸

```tsx
<LayoutDashboard className="size-4" />        // 16px
<Settings className="size-5" />               // 20px
<NotebookPen className="size-8" />            // 32px
```

shadcn 的 Button 已经处理了 `[&_svg]:size-4` —— Button 里塞 lucide icon 默认 16px:

```tsx
<Button>
  <Plus /> New note
</Button>
```

---

## 不要做的事

- ❌ 在 `app/globals.css` 加大段自定义 CSS —— 应该全用 Tailwind
- ❌ 写 inline style 颜色值 —— 用 className + semantic token
- ❌ 直接 `var(--font-geist-sans)` 在 inline style 里 —— 用 `font-sans` className
- ❌ 自己接 `next-themes` —— 用 atoms 的 `<ThemeProvider>`
- ❌ 自己写防闪烁的 `<script>` —— 模板已经覆盖了字体 / 布局两个,主题由 next-themes 自带
- ❌ 在项目里改 `--primary` 散落多处 —— 改就改 `globals.css` 一处,不要 page / component 局部覆盖
- ❌ 用 dark: 前缀写大量自定义颜色 —— semantic token 已经处理了明暗,`text-foreground` 在 light 是黑、dark 是白

---

## Checklist

- [ ] 没有 hex 字面量(`#xxxxxx`)出现在源码里(除了 svg path 这种特殊情况)
- [ ] `app/layout.tsx` 的 head 内联脚本没动(字体防闪烁)
- [ ] 三个 Provider 嵌套顺序对:`<NuqsAdapter>` → `<ThemeProvider>` → `<FontProvider>` → `<QueryProvider>`
- [ ] Dashboard layout 用 atoms 的 `<LayoutProvider>` + `<SidebarProvider>`,不是 shadcn 的
- [ ] 主题色 `#17b3a3` 仅在 `@openconsole/shadcn/styles.css` 定义,项目里不重复
- [ ] icon 在配置数据里用字符串(`"LayoutDashboard"`),组件里用真组件 import
