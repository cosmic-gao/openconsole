# 主题化

`@opendesign/atoms` 的主题系统是 `next-themes` + Tailwind v4 语义 token
（从 `@opendesign/shadcn` 继承）+ 三个 atoms provider 的组合。这份文件
讲清楚:

- 亮 / 暗切换怎么连
- View Transitions API 圆形展开动画
- 字体切换
- 布局变体切换
- 怎么扩展主题预设（局限）

---

## 亮 / 暗切换

```tsx
import { ThemeProvider, ThemeSwitch } from "@opendesign/atoms";

// 包根
<ThemeProvider>{children}</ThemeProvider>

// 任何位置
<ThemeSwitch />
```

`ThemeProvider` 是 `next-themes` 的 `ThemeProvider` 的薄包装，默认:

```tsx
<NextThemesProvider
  attribute="class"            // 给 <html> 加 "dark" class
  defaultTheme="system"         // 跟随系统
  enableSystem
  disableTransitionOnChange     // 避免颜色 transition 闪烁
/>
```

要改默认行为传同名 prop:

```tsx
<ThemeProvider defaultTheme="light">{children}</ThemeProvider>
```

---

## View Transitions 圆形展开

`ThemeSwitch` 点击时把鼠标坐标转成 `--vt-origin-x` / `--vt-origin-y`
两个 CSS 百分比，调用 `document.startViewTransition` 切主题。配合下面
的全局 CSS 就有从点击点圆形展开的动画:

```css
/* 在 app 的全局 CSS 加这段 */
@supports (view-transition-name: root) {
  ::view-transition-new(root) {
    clip-path: circle(0% at var(--vt-origin-x, 50%) var(--vt-origin-y, 50%));
    animation: vt-circle-in 350ms ease-out forwards;
  }
  @keyframes vt-circle-in {
    to {
      clip-path: circle(150% at var(--vt-origin-x, 50%) var(--vt-origin-y, 50%));
    }
  }
}
```

不支持 View Transitions 的浏览器（Firefox < 132 等）会降级为瞬切。

### 自己写带动画的切换按钮

`useViewTransition` 是 atoms 包**内部**的 hook（没在 barrel 导出）。
要自己写带 view-transition 的切换按钮，复制 ThemeSwitch 的思路:

```tsx
"use client";
import { useTheme } from "next-themes";
import { Button } from "@opendesign/shadcn";

type TransitionDocument = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

export function MyThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const onClick = (e: React.MouseEvent) => {
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

  return <Button onClick={onClick}>切换主题</Button>;
}
```

> 用 `resolvedTheme` 而不是 `theme` —— 当用户处于 System 模式时
> `theme === "system"`，naive 的 `theme === "dark" ? ...` 第一次点
> 会无动作。

---

## 字体切换

```tsx
import { FontProvider, useFont } from "@opendesign/atoms";

// 包根
<FontProvider options={["inter", "manrope", "system"]}>
  {children}
</FontProvider>

// 任何位置
function MyFontPicker() {
  const { font, setFont, options } = useFont();
  return (
    <select value={font} onChange={(e) => setFont(e.target.value)}>
      {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );
}
```

`FontProvider` 给 `<html>` 加 `font-${value}` class（默认 prefix `font-`）。
**你需要在全局 CSS 里定义对应规则**:

```css
html.font-inter { font-family: var(--font-inter), sans-serif; }
html.font-manrope { font-family: var(--font-manrope), sans-serif; }
html.font-system { font-family: ui-sans-serif, system-ui, sans-serif; }
```

变量来自 `next/font/google` 或类似:

```ts
// app/fonts.ts
import { Inter, Manrope } from "next/font/google";

export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
```

```tsx
// app/layout.tsx
<body className={`${inter.variable} ${manrope.variable}`}>
```

### 关闭持久化

```tsx
<FontProvider storage={null}>{children}</FontProvider>
```

### 自定义 class prefix

```tsx
<FontProvider classPrefix="theme-font-">  {/* class 变成 theme-font-inter */}
  {children}
</FontProvider>
```

### 关闭 class 应用（自己接）

```tsx
<FontProvider classPrefix="">{children}</FontProvider>
```

然后用 `useFont()` 的 `font` 值自己应用到任意元素。

---

## 布局变体切换

```tsx
import { LayoutProvider, useLayout, Sidebar } from "@opendesign/atoms";
import { SidebarProvider } from "@opendesign/shadcn";

// 包根
<LayoutProvider>
  <SidebarProvider>
    <Sidebar {...data} />
    {children}
  </SidebarProvider>
</LayoutProvider>

// 设置面板里
function LayoutSettings() {
  const { config, updateConfig } = useLayout();
  return (
    <>
      <select
        value={config.variant}
        onChange={(e) => updateConfig({ variant: e.target.value as any })}
      >
        <option value="sidebar">sidebar</option>
        <option value="floating">floating</option>
        <option value="inset">inset</option>
      </select>
      <select
        value={config.collapsible}
        onChange={(e) => updateConfig({ collapsible: e.target.value as any })}
      >
        <option value="offcanvas">offcanvas</option>
        <option value="icon">icon</option>
        <option value="none">none</option>
      </select>
      <select
        value={config.side}
        onChange={(e) => updateConfig({ side: e.target.value as any })}
      >
        <option value="left">left</option>
        <option value="right">right</option>
      </select>
    </>
  );
}
```

`Sidebar` 自动读 `config` 的三个值传给 shadcn 的 `Sidebar` 原语 ——
你不需要自己接线，只在做"用户能调"的设置面板时才用 `useLayout()`。

### 持久化

`LayoutProvider` **不持久化**。要持久化包一层 wrapper:

```tsx
"use client";
import * as React from "react";
import {
  LayoutProvider,
  useLayout,
  type LayoutConfig,
} from "@opendesign/atoms";

const STORAGE_KEY = "myapp-layout-config";

export function PersistentLayoutProvider({ children }: { children: React.ReactNode }) {
  const [stored] = React.useState<Partial<LayoutConfig> | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<LayoutConfig>) : undefined;
  });

  return (
    <LayoutProvider defaultConfig={stored}>
      <LayoutPersister />
      {children}
    </LayoutProvider>
  );
}

function LayoutPersister() {
  const { config } = useLayout();
  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);
  return null;
}
```

---

## 主题预设的扩展（局限）

`Preferences` 抽屉的主题 tab 内置 **shadcn 与 tweakcn** 两套预设。
这些预设的数据源在 atoms 包内部（`components/preferences/presets/`），
**消费方不能直接编辑**。

要扩展时:

1. **临时换主题** —— 让用户在 `Preferences` 的 **Importer** tab 里粘
   一段 `:root { … } .dark { … }` CSS。`Preferences` 会解析并即时应用。
2. **永久换主题** —— 在 app 的全局 CSS 里直接改 `:root` / `.dark` 的
   语义 token 变量（`--primary`、`--background` 等）。

如果你的项目需要内置更多预设（比如品牌色预设），目前的合规方式是:

- 在应用层自己维护一个预设列表
- 给用户做一个简单的 `<select>` UI（不走 `Preferences` 抽屉）
- 选中后用 `document.documentElement.style.setProperty` 一组一组写
  CSS 变量

```tsx
const presets = {
  ocean: {
    "--primary": "oklch(0.55 0.18 235)",
    "--background": "oklch(0.98 0.01 235)",
    /* ... */
  },
  forest: {
    "--primary": "oklch(0.55 0.18 145)",
    "--background": "oklch(0.98 0.01 145)",
    /* ... */
  },
};

function applyPreset(name: keyof typeof presets) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(presets[name])) {
    root.style.setProperty(k, v);
  }
}
```

---

## 三个 provider 的状态边界

| 状态 | 控制变量 | 应用到 |
|---|---|---|
| 亮 / 暗 | `<html class="dark">` | 所有引用 `dark:` variant 或语义 token 的元素 |
| 字体 | `<html class="font-inter">` | 全局 `font-family`（要全局 CSS 配合） |
| Sidebar 变体 | atoms `useLayout()` config | `Sidebar` 组件（shadcn `Sidebar` 原语的 `variant` / `collapsible` / `side` props） |
| Sidebar 展开 / 折叠 | shadcn `useSidebar()` open | `Sidebar` 组件自身 |

主题色 / 圆角 / spacing 等**结构性 token** 不在任何 provider 里，
它们就是全局 CSS 变量，所有组件自然读到。
