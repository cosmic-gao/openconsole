---
name: openconsole-atoms
description: >
  `@openconsole/atoms` 的使用指南。基于 `@openconsole/shadcn` 原语搭建的
  高阶组件 + Context provider —— ThemeSwitch（带 view-transition 圆形
  展开）、Preferences（设置抽屉）、Sidebar（带 brand / menu / account 三段
  式）、Combobox、DatePicker、DataTable、ColorPicker，以及 ThemeProvider /
  FontProvider / LayoutProvider。
  适用场景包括: 应用主框架搭建（主题 / 字体 / 布局 provider 装配）、
  设置抽屉、品牌侧边栏、数据表格、可搜索下拉、日期选择、颜色选择、
  亮暗主题切换。
type: ui
library: "@openconsole/atoms"
runtime:
  react: "^19"
  tailwind: "^4"
peers:
  "@openconsole/shadcn": "*"
  "lucide-react": "*"
  "next": "*"
  "next-themes": "*"
  "@tanstack/react-table": "*"
  "date-fns": "*"
---

# `@openconsole/atoms` —— 高阶 UI 组件 + Provider

一个 npm 包，把 `@openconsole/shadcn` 的原语装配成业务直接可用的高阶
组件（设置抽屉、品牌侧边栏、数据表格、主题切换…），加上一组 Context
provider 管理跨页面状态（主题、字体、布局变体）。

本包是**只读消费**: 所有可用导出就是 `index.ts` 列出的内容。没有 CLI、
不能改源码。

本文档覆盖:

1. 怎么从用户口语化需求识别到正确的 atom 组件
2. 应用根上 provider 的装配顺序与必要性
3. 每个组件的用法 + 完整代码示例
4. 跟 `@openconsole/shadcn` 如何配合（什么时候用 atoms 封装，什么时候直接用 shadcn 原语）
5. 主题 / 字体 / 布局 三套状态的扩展边界

---

## 什么时候用这个文档

满足下列任一情况就用:

- 在 import 了 `@openconsole/atoms` 的文件里写或修代码
- 搭建新应用的主框架（需要装配 `ThemeProvider` + `FontProvider` + `LayoutProvider`）
- 用户描述"加个设置抽屉"、"侧边栏带 logo"、"主题切换按钮"、"可搜索下拉"、
  "日期选择"、"数据列表 / 表格"等本包覆盖的场景
- 不确定何时用 atoms 的高阶组件 vs 直接用 shadcn 原语

---

## 项目上下文

| 字段 | 值 |
|---|---|
| 导入路径 | `@openconsole/atoms`（唯一入口） |
| 依赖底层 | `@openconsole/shadcn` 原语 |
| 样式 | 继承 shadcn 的 Tailwind v4 + 语义 token |
| 图标 | 通过 shadcn 的 `Icon` 包装，按字符串名渲染 lucide-react 图标 |
| 主题底层 | `next-themes`（`ThemeProvider` 是其包装） |
| 表格底层 | `@tanstack/react-table`（`DataTable` 是其包装） |
| 日期底层 | `react-day-picker` + `date-fns`（`DatePicker` 是其包装） |
| 持久化 | `ThemeProvider` 走 localStorage（next-themes 自带）；`FontProvider` 走 localStorage（可关）；`LayoutProvider` **不持久化** |

---

## 应用场景速查

用户口语化描述需求时，按下表识别意图。下表只列出**本包覆盖**的场景 ——
若需求落在 shadcn 原语上（按钮、对话框、Card 等），直接用 shadcn。

| 用户描述（关键词） | 选这个 | 关键 props / 组合 |
|---|---|---|
| "应用主框架 / 后台外壳" | 包根 `<ThemeProvider> + <FontProvider> + <LayoutProvider>` + `<Sidebar>` | 装配顺序见 [Provider 装配](#provider-装配关键) |
| "主题切换按钮 / 亮暗切换" | `ThemeSwitch` | 零配置组件，自动用 view-transition 圆形展开 |
| "设置抽屉 / 偏好 / 主题面板 / 切字体切布局" | `Preferences` | `<Preferences open={x} onOpenChange={setX} />` |
| "侧边栏 / 导航 / 后台侧栏 / 带 logo 的侧栏" | `Sidebar` | 传 `brand` + `menu` + `account` 三个数据 |
| "用户列表 / 数据表格 / 列表" | `DataTable` | 传 `columns` + `data`，可选 `pageSize` / `pagination` |
| "可搜索下拉 / 自动补全 / 选项搜索" | `Combobox` | 传 `options: { value, label }[]` + `value` / `onValueChange` |
| "日期选择器 / 日期输入" | `DatePicker` | 传 `value: Date` + `onValueChange: (Date) => void` |
| "颜色输入 / 调色板字段" | `ColorPicker` | 绑一个 `cssVar`，回调时 setProperty |
| "字体切换（业务自己做按钮）" | `useFont()` hook + 自己写 toggle | `FontProvider` 必须在外层 |
| "布局变体切换（变 floating / inset、左右、折叠模式）" | `useLayout()` hook | `LayoutProvider` 必须在外层；`config.variant` / `collapsible` / `side` |

### 几个常见判定边界

- "我要 Sidebar" → 用 atoms 的 `Sidebar`（一站搞定 brand/menu/account），
  不是手动拼 shadcn 的 `<Sidebar>` 根 + 子原语。
- "我要主题切换按钮" → 用 atoms 的 `ThemeSwitch`，不用自己写 `useTheme`。
- "我要主题 + 字体 + 布局 三合一面板" → 用 atoms 的 `Preferences`。
- "我要选个日期 / 选个选项" → atoms 的 `DatePicker` / `Combobox` 比手动
  拼 `Popover` + `Calendar` / `Popover` + `Command` 干净。
- "我要数据表格但没排序筛选需求" → 直接用 shadcn 的 `Table` 就够了，
  不用 `DataTable`。
- "我要多选下拉 / 日期区间" → atoms 不覆盖，用 shadcn 原语自己拼。

---

## Provider 装配（关键）

```tsx
// app/layout.tsx 或类似根布局
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

**装配顺序**: `ThemeProvider` → `FontProvider` → `LayoutProvider` →
`SidebarProvider`（shadcn 的）→ children。

- `ThemeProvider` 在最外，给 `<html>` 加 `dark` class。
- `FontProvider` 给 `<html>` 加 `font-${value}` class。
- `LayoutProvider` 持有 sidebar 变体状态（`variant` / `collapsible` / `side`）。
- `SidebarProvider`（**shadcn 的**，不是 atoms 的）是用 atoms `Sidebar`
  组件的必要前置。

详见 [provider-setup.md](./provider-setup.md)。

---

## 组件速查

### `ThemeSwitch`

零 prop，一键切换亮 / 暗。自动用 View Transitions API 做圆形展开动画，
不支持的浏览器降级为瞬切。读 `resolvedTheme`，处于 System 模式时也能
正确翻转。

```tsx
import { ThemeSwitch } from "@openconsole/atoms";

<ThemeSwitch />
```

放在 nav / sidebar / header 的角落。

### `Preferences`

完整的设置抽屉，从右侧拉出。内置 tab:
- **主题**: shadcn 与 tweakcn 两套预设可选，每个 token 单独调（用内置
  `ColorPicker`），支持粘 CSS 导入。
- **布局**: 调 `LayoutConfig`（variant / collapsible / side），实时影响
  `Sidebar`。
- **字体**: 切 `useFont()` 当前字体。

```tsx
import { Preferences } from "@openconsole/atoms";
import { Button } from "@openconsole/shadcn";
import { Settings } from "lucide-react";

function PreferencesButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <Settings />
      </Button>
      <Preferences open={open} onOpenChange={setOpen} />
    </>
  );
}
```

**前置**: 包根上必须有 `ThemeProvider` + `FontProvider` + `LayoutProvider`。

### `Sidebar`

带品牌区 / 菜单区 / 账号区三段式的侧边栏，从 `LayoutProvider` 自动
读 `variant` / `collapsible` / `side`。

```tsx
import { Sidebar } from "@openconsole/atoms";
import { SidebarInset } from "@openconsole/shadcn";

const data = {
  brand: {
    name: "Acme",
    logo: "Command",                       // lucide 图标名
    description: "Workspace · Free",
  },
  menu: [
    {
      label: "Main",
      items: [
        { label: "仪表盘", icon: "LayoutDashboard", href: "/" },
        { label: "项目", icon: "FolderOpen", href: "/projects", badge: "12" },
        {
          label: "团队",
          icon: "Users",
          children: [
            { label: "成员", icon: "User", href: "/team/members" },
            { label: "权限", icon: "Shield", href: "/team/permissions" },
          ],
        },
      ],
    },
  ],
  account: {
    name: "Jane Doe",
    email: "jane@acme.com",
    avatar: "/avatar.png",
  },
};

// 在 SidebarProvider 内部使用
<Sidebar {...data} />
<SidebarInset>{children}</SidebarInset>
```

**注意**:
- 数据驱动 —— 不要在 JSX 里手拼菜单项。
- 图标用字符串名（`"LayoutDashboard"`），不要 import 图标组件。
- 菜单**只渲染一层嵌套**（parent + children），更深的会被忽略。
- 同时 import shadcn 的 `Sidebar` 时记得起别名（见
  [常见坑](#常见坑)）。

### `DataTable`

`@tanstack/react-table` 的薄封装 —— 排序、筛选、分页内建。

```tsx
import { DataTable } from "@openconsole/atoms";
import { Badge } from "@openconsole/shadcn";
import type { ColumnDef } from "@tanstack/react-table";

type Project = { id: string; name: string; status: "active" | "archived" };

const columns: ColumnDef<Project>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.status === "active" ? "default" : "secondary"}>
        {row.original.status}
      </Badge>
    ),
  },
];

<DataTable columns={columns} data={projects} pageSize={20} />
```

详见 [data-table.md](./data-table.md)。

### `Combobox`

可搜索的单选下拉。

```tsx
import { Combobox } from "@openconsole/atoms";

const [value, setValue] = React.useState<string>();

<Combobox
  options={[
    { value: "next", label: "Next.js" },
    { value: "vite", label: "Vite" },
    { value: "remix", label: "Remix" },
  ]}
  value={value}
  onValueChange={setValue}
  placeholder="选择框架"
  searchPlaceholder="搜索..."
  emptyText="没有匹配项"
/>
```

**只支持单选**。需要多选用 shadcn 原语自己拼 `Command` + `Popover` +
`Checkbox`。

### `DatePicker`

带日历的日期输入。

```tsx
import { DatePicker } from "@openconsole/atoms";

const [date, setDate] = React.useState<Date>();

<DatePicker
  value={date}
  onValueChange={setDate}
  placeholder="选择日期"
  formatStr="yyyy-MM-dd"     // date-fns 格式
/>
```

**只支持单日**。要日期区间用 shadcn 的 `Calendar mode="range"` 自己拼。

### `ColorPicker`

绑一个 CSS 变量的颜色输入 —— 用于设置面板里调 token。

```tsx
import { ColorPicker } from "@openconsole/atoms";

<ColorPicker
  label="主色"
  cssVar="--primary"
  value="oklch(0.6 0.15 250)"
  onChange={(cssVar, value) => {
    document.documentElement.style.setProperty(cssVar, value);
  }}
/>
```

接受 hex / oklch / hsl / rgb / named color。色块（swatch）用 canvas 把
任意 CSS 颜色转成 `#RRGGBB` 供 `<input type="color">` 用。

---

## Provider hooks

### `useFont()` —— 字体切换

```tsx
import { useFont } from "@openconsole/atoms";
import { ToggleGroup, ToggleGroupItem } from "@openconsole/shadcn";

function FontToggle() {
  const { font, setFont, options } = useFont();
  return (
    <ToggleGroup
      type="single"
      value={font}
      onValueChange={(v) => v && setFont(v)}
    >
      {options.map((opt) => (
        <ToggleGroupItem key={opt} value={opt}>{opt}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
```

`FontProvider` 默认提供 `["inter", "manrope", "system"]` 三个选项，通过
给 `<html>` 加 `font-${value}` class 应用。要换字体列表传
`<FontProvider options={...}>`。

### `useLayout()` —— 布局变体

```tsx
import { useLayout } from "@openconsole/atoms";

const { config, updateConfig } = useLayout();
// config = { variant, collapsible, side }
// variant: "sidebar" | "floating" | "inset"
// collapsible: "offcanvas" | "icon" | "none"
// side: "left" | "right"

updateConfig({ variant: "floating" });
```

`Sidebar` 自动读这个 config —— 业务通常不用直接读，只在做设置面板时
才用到。

---

## 主题化

详见 [theming.md](./theming.md)。短版本:

- 颜色 / 圆角 / 字体的 CSS 变量定义在 app 的全局 CSS（语义 token 由
  shadcn 锁定）。
- 切主题预设: 用 `Preferences` 组件或粘 CSS 进它的 Importer tab。
- 自定义切换动画: `ThemeSwitch` 已内置 view-transition 圆形展开。要
  自己写带动画的切换按钮，模仿 `ThemeSwitch` 的实现（用
  `document.startViewTransition` + 设置 `--vt-origin-x/y` CSS 变量）。

---

## 与 shadcn 的边界

| 任务 | 用 atoms | 用 shadcn |
|---|---|---|
| 主题切换按钮 | ✓ `ThemeSwitch` | （不要自己拼） |
| 设置抽屉 | ✓ `Preferences` | （不要自己拼几个 tab + sheet） |
| 品牌侧边栏 | ✓ `Sidebar` | （不要手动拼 `Sidebar` 根 + sub-primitives） |
| 数据表格 with 排序/筛选/分页 | ✓ `DataTable` | （不要自己接 tanstack-table） |
| 可搜索单选 | ✓ `Combobox` | （`Popover` + `Command` 是底层，atoms 已包好） |
| 单日 picker | ✓ `DatePicker` | （`Popover` + `Calendar` 是底层） |
| 调色板字段 | ✓ `ColorPicker` | — |
| 主题 / 字体 / 布局 三个 provider | ✓ atoms 的 provider | shadcn 的 `SidebarProvider` 仍要装配 |
| 任何按钮、Card、Dialog、Tabs、Form、Alert 等基础原语 | — | ✓ |
| 多选下拉、日期区间、命令面板等 atoms 没覆盖的复合 | — | ✓ 拼原语 |

---

## 常见坑

- **没装配 provider**: `useLayout()` / `useFont()` 不在 `LayoutProvider` /
  `FontProvider` 里调用会抛错。`Preferences` 组件依赖**三个 atoms
  provider** 都在外层。
- **忘了 `SidebarProvider`（shadcn 的）**: atoms 的 `Sidebar` 内部**不
  包含** `SidebarProvider` —— 那是 shadcn 原语，根布局里要自己加。
- **`Sidebar` 名字冲突**: shadcn 也导出 `Sidebar` 原语。同时 import 两
  者时给其中一个起别名:

  ```tsx
  import { Sidebar } from "@openconsole/atoms";              // 业务用 atoms 的
  import { SidebarProvider, SidebarInset } from "@openconsole/shadcn"; // 子原语没冲突
  ```

- **图标用字符串名而非 JSX**: `Sidebar` 的 `brand.logo` /
  `menu.items[].icon` 传字符串（`"LayoutDashboard"`），不是图标组件。
- **`MenuItem.children` 只渲染一层**: 不要传 3 层及以上的嵌套。
- **`DatePicker` / `Combobox` 不支持多选 / 区间**: 这两个组件刻意单选。
  需要扩展功能时回到 shadcn 原语自己拼。
- **`LayoutProvider` 不持久化**: 用户刷新页面后侧栏变体会重置。要持久化
  自己包一个 `LayoutProvider` wrapper 读写 cookie / localStorage。
- **`ThemeProvider` 已经包好 `next-themes`**: 不要再嵌套 next-themes
  的 ThemeProvider。直接用 atoms 的版本。

---

## 详细参考

- [provider-setup.md](./provider-setup.md) —— provider 装配顺序、必要性、跟 `SidebarProvider` 的关系、持久化扩展。
- [data-table.md](./data-table.md) —— tanstack-table 的常见 column 定义、自定义 cell、跟 `Badge` / `Button` 等的协作。
- [theming.md](./theming.md) —— `next-themes` 集成、view-transition 自定义、字体扩展、布局持久化。
