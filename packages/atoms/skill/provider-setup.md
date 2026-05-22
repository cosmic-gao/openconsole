# Provider 装配

`@openconsole/atoms` 暴露三个 Context provider，加上一个 shadcn 原生
provider，构成应用根布局的标准装配。这份文件讲清楚:

- 每个 provider 是干什么的
- 必要的装配顺序与原因
- 默认值与可调 prop
- 持久化策略与扩展点

---

## 四个 provider 的角色

| Provider | 来自 | 管理什么 | 持久化 |
|---|---|---|---|
| `ThemeProvider` | `@openconsole/atoms` | 亮 / 暗 / 系统主题（给 `<html>` 加 `dark` class） | localStorage（next-themes 自带） |
| `FontProvider` | `@openconsole/atoms` | 当前字体（给 `<html>` 加 `font-${name}` class） | localStorage（默认 `openconsole-font`，可关） |
| `LayoutProvider` | `@openconsole/atoms` | Sidebar 变体: `variant` / `collapsible` / `side` | **不持久化**（业务自接） |
| `SidebarProvider` | `@openconsole/shadcn` | Sidebar 展开 / 折叠状态、移动端切换 | cookie（shadcn 自带） |

---

## 标准装配

```tsx
// app/layout.tsx
import {
  ThemeProvider,
  FontProvider,
  LayoutProvider,
} from "@openconsole/atoms";
import { SidebarProvider } from "@openconsole/shadcn";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <FontProvider>
            <LayoutProvider>
              <SidebarProvider>
                {children}
              </SidebarProvider>
            </LayoutProvider>
          </FontProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### `suppressHydrationWarning`

`<html>` 上必须加 `suppressHydrationWarning` —— `next-themes` 在客户端
首屏前会同步设置 `dark` class，跟服务端渲染时的 class 必然不一致，
不抑制就报 hydration warning。

---

## 为什么是这个顺序

由内而外依赖关系是: `SidebarProvider` → `LayoutProvider` →
`FontProvider` → `ThemeProvider`。

- **`ThemeProvider` 在最外**: 它给 `<html>` 加 `dark` class，外层的
  CSS 解析依赖这个 class。如果套在别的 provider 里面，next-themes 的
  脚本可能在子 provider mount 之前才执行。
- **`FontProvider` 紧贴 `ThemeProvider`**: 也给 `<html>` 加 class
  （`font-inter` 等），逻辑上跟 ThemeProvider 同层级，但因为
  ThemeProvider 还做 SSR / matchMedia 等更底层的事，放到 ThemeProvider
  内部比较自然。
- **`LayoutProvider` 在 FontProvider 内**: 它只是普通 React state，
  没 DOM 副作用，位置相对自由。
- **`SidebarProvider`（shadcn 的）在最内**: 它读 `LayoutProvider` 的
  config 来决定 sidebar 的初始状态。如果你的 Sidebar 不在所有 route
  下都显示，也可以把 `SidebarProvider` 下移到只包含 sidebar 的 layout 里。

---

## 单独可拆性

不是所有应用都需要全套。常见组合:

### 只要主题切换

```tsx
<ThemeProvider>{children}</ThemeProvider>
```

业务只用 `ThemeSwitch` 或 next-themes 的 `useTheme`。

### 主题 + 字体切换

```tsx
<ThemeProvider>
  <FontProvider>{children}</FontProvider>
</ThemeProvider>
```

业务可用 `useFont()` 自己做字体切换 UI。

### 主题 + 布局（不用字体切换）

```tsx
<ThemeProvider>
  <LayoutProvider>
    <SidebarProvider>
      {children}
    </SidebarProvider>
  </LayoutProvider>
</ThemeProvider>
```

### 用 `Preferences` 抽屉

必须**三个 atoms provider 全装上**:

```tsx
<ThemeProvider>
  <FontProvider>
    <LayoutProvider>
      {/* Preferences 内部读这三个 */}
      {children}
    </LayoutProvider>
  </FontProvider>
</ThemeProvider>
```

---

## 各 provider 的可调 prop

### `ThemeProvider`

```tsx
<ThemeProvider
  attribute="class"           // 默认 "class"
  defaultTheme="system"        // 默认 "system"
  enableSystem                 // 默认 true
  disableTransitionOnChange    // 默认 true（避免颜色切换时的 transition 闪烁）
>
  {children}
</ThemeProvider>
```

接受任何 `next-themes` 的 `ThemeProvider` prop —— 它就是个薄包装。

### `FontProvider`

```tsx
<FontProvider
  options={["inter", "manrope", "jetbrains-mono", "system"]}
  defaultFont="inter"
  storage="myapp-font"         // null 关闭持久化
  classPrefix="font-"          // "" 关闭 class 应用
>
  {children}
</FontProvider>
```

字体生效靠在 `<html>` 上加 `font-${value}` class。**默认的三种字体
规则（`inter` / `manrope` / `system`）已由 `@openconsole/atoms/styles.css`
内置**, 等价于:

```css
:root.font-inter body { font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif; }
:root.font-manrope body { font-family: var(--font-manrope), ui-sans-serif, system-ui, sans-serif; }
:root.font-system body { font-family: ui-sans-serif, system-ui, sans-serif, ...emoji; }
```

消费方只需配好对应的 CSS 变量 (`--font-inter`, `--font-manrope`),
通常来自 `next/font/google`:

```ts
// app/fonts.ts
import { Inter, Manrope } from "next/font/google";

export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

// app/layout.tsx
<body className={`${inter.variable} ${manrope.variable}`}>
```

要扩展更多字体（例如 `jetbrains-mono`）则需要在 app 全局 CSS 里自己加
对应的 `:root.font-jetbrains-mono body { ... }` 规则, 并通过
`<FontProvider options={[..., "jetbrains-mono"]}>` 把它加进可选列表。

### `LayoutProvider`

```tsx
<LayoutProvider
  defaultConfig={{
    variant: "inset",          // sidebar | floating | inset
    collapsible: "icon",       // offcanvas | icon | none
    side: "left",              // left | right
  }}
>
  {children}
</LayoutProvider>
```

不持久化。要持久化自己包一层:

```tsx
"use client";
import { LayoutProvider, type LayoutConfig } from "@openconsole/atoms";

export function PersistentLayoutProvider({ children }: { children: React.ReactNode }) {
  const stored = typeof window !== "undefined"
    ? localStorage.getItem("layout-config")
    : null;
  const defaultConfig = stored ? (JSON.parse(stored) as LayoutConfig) : undefined;

  return (
    <LayoutProvider defaultConfig={defaultConfig}>
      <LayoutPersister />
      {children}
    </LayoutProvider>
  );
}

function LayoutPersister() {
  const { config } = useLayout();
  React.useEffect(() => {
    localStorage.setItem("layout-config", JSON.stringify(config));
  }, [config]);
  return null;
}
```

---

## hook 契约

每个 hook 必须在对应的 provider 内调用，否则抛错。

| Hook | 必须在 | 返回 |
|---|---|---|
| `useTheme()`（来自 next-themes） | `ThemeProvider` | `{ theme, resolvedTheme, setTheme, themes }` |
| `useFont()` | `FontProvider` | `{ font, setFont, options }` |
| `useLayout()` | `LayoutProvider` | `{ config, updateConfig }` |
| `useSidebar()`（来自 shadcn） | `SidebarProvider` | `{ open, setOpen, openMobile, ... }` |

抛错信息长这样:
- `useLayout must be used within a LayoutProvider`
- `useFont must be used within a FontProvider`

看到这种报错 → 检查包根 provider 装配。

---

## SSR 注意事项

- **`ThemeProvider`**: `next-themes` 在客户端 hydration 前会同步设
  class，所以 SSR 输出**不带** `dark` class，hydration 后才补。配合
  `suppressHydrationWarning` 用。
- **`FontProvider`**: 跟 ThemeProvider 类似 —— 客户端 `useEffect`
  里读 localStorage 后才设 class。首屏可能有字体闪烁。要避免闪烁可以
  把 `defaultFont` 设成跟 SSR 输出一致的字体。
- **`LayoutProvider`**: 纯客户端 state，SSR 输出固定的 `defaultConfig`
  快照。
