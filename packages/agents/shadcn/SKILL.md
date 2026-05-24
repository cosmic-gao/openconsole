---
name: shadcn
description: >
  @openconsole/shadcn + @openconsole/atoms 使用规范。基础 UI 组件（primitives）来自
  @openconsole/shadcn（Button, Card, Dialog, Sidebar 等），高阶组件来自 @openconsole/atoms
  （ThemeSwitch, Preferences, Sidebar, Header, Breadcrumbs 等）。触发场景：使用 UI 组件、表单布局、
  主题适配、布局组合。
---

# UI 组件规范

本项目使用双包架构：

| 包                    | 职责                       | 导入                                           |
| --------------------- | -------------------------- | ---------------------------------------------- |
| `@openconsole/shadcn` | 基础 UI 组件（primitives） | `import { Button } from '@openconsole/shadcn'` |
| `@openconsole/atoms`  | 高阶业务组件               | `import { Header } from '@openconsole/atoms'`  |

---

## 组件选择原则

1. **优先使用 atoms 高阶组件**：Settings drawer → `Preferences`；带 logo 的侧边栏 → `Sidebar`；主题切换按钮 → `ThemeSwitch`。
2. **基础组件用于原子化需求**：shadcn 组件用于构建业务组件，不直接暴露给页面。
3. **禁止混用其他 UI 库**：只使用 `@openconsole/shadcn` + `@openconsole/atoms`，禁止引入其他 UI 库。

---

## 目录结构

```
features/<domain>/
├── components/     # 业务 UI 组件（组合 shadcn + atoms）
├── api/           # TanStack Query API 层
├── hooks/         # 自定义 hooks
└── schemas.ts    # Zod schemas

app/
├── layout.tsx     # Root layout（Providers 组合）
└── page.tsx       # 页面
```

---

## Providers 组合

### 1. 字体配置（app/fonts.ts）

```ts
// app/fonts.ts
import { Inter, Manrope } from "next/font/google";

export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
```

### 2. 根 Layout（app/layout.tsx）

根 Layout 只放 `ThemeProvider` + `FontProvider`。

```tsx
// app/layout.tsx
import "./globals.css";
import { inter, manrope } from "./fonts";
import { ThemeProvider, FontProvider } from "@openconsole/atoms";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="font-inter" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var font = localStorage.getItem('openconsole-font')
                  if (font && ['inter', 'manrope', 'system'].includes(font)) {
                    document.documentElement.classList.remove('font-inter')
                    document.documentElement.classList.add('font-' + font)
                  }
                } catch (e) {}
              })()
            `,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${manrope.variable} antialiased`}>
        <NuqsAdapter>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <FontProvider>
              <NextToploader color="var(--primary)" showSpinner={false} />
              {children}
              <Toaster />
            </FontProvider>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
```

### 3. 业务 Layout（如 app/dashboard/layout.tsx）

业务 Layout 放 `LayoutProvider` + `SidebarProvider` + `Sidebar` + `Header`。

```tsx
// app/dashboard/layout.tsx
import { Header, LayoutProvider, Sidebar } from "@openconsole/atoms";
import { SidebarInset, SidebarProvider } from "@openconsole/shadcn";
import { Suspense } from "react";
import { siderConfig } from "@/config/sidebar";
import { auth } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const account = session ? { name: session.user?.name ?? "User", email: session.user?.email ?? "", avatar: "" } : { name: "Guest", email: "guest@example.com", avatar: "" };

  return (
    <LayoutProvider>
      <SidebarProvider>
        <Sidebar brand={siderConfig.brand} menu={siderConfig.menu} account={account} />
        <SidebarInset>
          <Suspense>
            <Header />
          </Suspense>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </LayoutProvider>
  );
}
```

**关键点**：

- `<html>` 需要 `className="font-inter"` 和 `suppressHydrationWarning`
- 内联脚本防止字体闪烁
- `ThemeProvider` → `FontProvider` 在根 Layout
- `LayoutProvider` → `SidebarProvider` → `Sidebar` + `Header` 在业务 Layout

---

## atoms 高阶组件

详见 [atoms-usage.md](./rules/atoms-usage.md)。

---

## Critical Rules

这些规则**强制执行**。

### 样式与 Tailwind → [styling.md](./rules/styling.md)

- **`className` 用于布局，不用于样式**：不要覆盖组件颜色或字体。
- **禁止 `space-x-*` / `space-y-*`**：使用 `flex gap-*` 代替。
- **等宽高用 `size-*`**：`size-10` 而不是 `w-10 h-10`。
- **使用 `truncate` 简写**：不是 `overflow-hidden text-ellipsis whitespace-nowrap`。
- **禁止手动 `dark:` 颜色覆盖**：使用语义 token（`bg-background`、`text-muted-foreground`）。
- **条件类用 `cn()`**：不要写手动模板字符串三元表达式。
- **覆盖组件禁止手动 `z-index`**：Dialog、Sheet、Popover 等自行处理层叠。

### 表单与输入 → [forms.md](./rules/forms.md)

- **表单使用 `FieldGroup` + `Field`**：不要用原始 `div` + `space-y-*` 做表单布局。
- **`InputGroup` 使用 `InputGroupInput` / `InputGroupTextarea`**：不要在 `InputGroup` 内直接用 `Input` / `Textarea`。
- **输入框内的按钮使用 `InputGroup` + `InputGroupAddon`**。
- **2-7 个选项用 `ToggleGroup`**：不要手动循环 `Button`。
- **相关复选框 / 单选分组用 `FieldSet` + `FieldLegend`**。
- **字段验证使用 `data-invalid` + `aria-invalid`**：`data-invalid` 在 `Field` 上，`aria-invalid` 在控件上。

### 组件结构 → [composition.md](./rules/composition.md)

- **项必须在 Group 内**：`SelectItem` → `SelectGroup`、`DropdownMenuItem` → `DropdownMenuGroup`。
- **Dialog、Sheet、Drawer 必须有 Title**：`DialogTitle`、`SheetTitle`、`DrawerTitle` 是可访问性必需。
- **使用完整 Card 组合**：`CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`。
- **Button 没有 `isPending` / `isLoading` 属性**：组合 `Spinner` + `data-icon` + `disabled`。
- **`TabsTrigger` 必须在 `TabsList` 内**。
- **`Avatar` 必须有 `AvatarFallback`**。

### 使用组件而非自定义标记 → [composition.md](./rules/composition.md)

- **使用现有组件**：Callout 用 `Alert`；空状态用 `Empty`；Toast 用 `sonner`。
- **`Separator`** 代替 `<hr>` 或 `<div className="border-t">`。
- **`Skeleton`** 代替自定义 `animate-pulse` div。
- **`Badge`** 代替自定义样式 span。

### 图标 → [icons.md](./rules/icons.md)

- **Button 内图标使用 `data-icon`**：`data-icon="inline-start"` 或 `data-icon="inline-end"`。
- **组件内图标不加尺寸类**：组件通过 CSS 处理图标尺寸。
- **图标作为对象传递**：不是字符串键的查找表。

---

## 关键模式

```tsx
// 表单布局：FieldGroup + Field，不用 div + Label
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">邮箱</FieldLabel>
    <Input id="email" />
  </Field>
</FieldGroup>

// 验证：data-invalid 在 Field，aria-invalid 在控件
<Field data-invalid>
  <FieldLabel>邮箱</FieldLabel>
  <Input aria-invalid />
  <FieldDescription>无效的邮箱地址。</FieldDescription>
</Field>

// Button 图标：data-icon，不加尺寸类
<Button>
  <SearchIcon data-icon="inline-start" />
  搜索
</Button>

// 间距：gap-*，不是 space-y-*
<div className="flex flex-col gap-4">  // 正确
<div className="space-y-4">           // 错误

// 等宽高：size-*，不是 w-* h-*
<Avatar className="size-10">   // 正确
<Avatar className="w-10 h-10"> // 错误

// 状态颜色：Badge variants 或语义 token，不用原始颜色
<Badge variant="secondary">+20.1%</Badge>    // 正确
<span className="text-emerald-600">+20.1%</span> // 错误
```

---

## 组件选择表

| 需求           | 使用                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------- |
| 按钮 / 操作    | `Button` + 适当 variant                                                                             |
| 表单输入       | `Input`, `Select`, `Combobox`, `Switch`, `Checkbox`, `RadioGroup`, `Textarea`, `InputOTP`, `Slider` |
| 2-5 个选项切换 | `ToggleGroup` + `ToggleGroupItem`                                                                   |
| 数据展示       | `Table`, `Card`, `Badge`, `Avatar`                                                                  |
| 导航           | `Sidebar`, `NavigationMenu`, `Breadcrumb`, `Tabs`, `Pagination`                                     |
| 覆盖层         | `Dialog`（模态框）, `Sheet`（侧边面板）, `Drawer`（底部面板）, `AlertDialog`（确认框）              |
| 反馈           | `sonner`（Toast）, `Alert`, `Progress`, `Skeleton`, `Spinner`                                       |
| 命令面板       | `Command` + `Dialog`                                                                                |
| 图表           | `Chart`（Recharts 封装）                                                                            |
| 布局           | `Card`, `Separator`, `Resizable`, `ScrollArea`, `Accordion`, `Collapsible`                          |
| 空状态         | `Empty`                                                                                             |
| 菜单           | `DropdownMenu`, `ContextMenu`, `Menubar`                                                            |
| 提示 / 信息    | `Tooltip`, `HoverCard`, `Popover`                                                                   |

---

## 主题适配

详见 [customization.md](./customization.md)。

---

## 详细参考

- [rules/styling.md](./rules/styling.md) — 语义颜色、variants、className、间距、size、truncate、dark mode、cn()、z-index
- [rules/forms.md](./rules/forms.md) — FieldGroup、Field、InputGroup、ToggleGroup、FieldSet、验证状态
- [rules/composition.md](./rules/composition.md) — Groups、覆盖层、Card、Avatar、Alert、Empty、Toast、Separator、Skeleton、Badge、Button 加载状态、atoms vs primitives 边界
- [rules/icons.md](./rules/icons.md) — data-icon、图标尺寸、图标作为对象传递
- [rules/atoms-usage.md](./rules/atoms-usage.md) — atoms 高阶组件使用规范
- [customization.md](./customization.md) — 主题适配、语义 token、CSS 变量
