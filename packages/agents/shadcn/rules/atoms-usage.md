# atoms 高阶组件使用规范

## 目录

- 概述
- Provider 组合
- 组件 API
- 与 primitives 的边界

---

## 概述

`@openconsole/atoms` 是基于 `@openconsole/shadcn` primitives 的高阶业务组件包。

| 包 | 职责 | 导入方式 |
| --- | --- | --- |
| `@openconsole/shadcn` | 基础 UI 组件 | `import { Button } from '@openconsole/shadcn'` |
| `@openconsole/atoms` | 高阶业务组件 | `import { Header } from '@openconsole/atoms'` |

atoms 包是**只读消费**：所有可用的导出都在 `index.ts` 中列出。没有 CLI，源文件不可修改。

---

## Provider 说明

| Provider | 来自 | 作用 | 持久化 |
| --- | --- | --- | --- |
| `ThemeProvider` | `@openconsole/atoms` | 亮/暗/系统主题（添加 `dark` class 到 `<html>`） | localStorage（通过 next-themes） |
| `FontProvider` | `@openconsole/atoms` | 活跃字体（添加 `font-${name}` class 到 `<html>`） | localStorage（可禁用） |
| `LayoutProvider` | `@openconsole/atoms` | 侧边栏变体：`variant` / `collapsible` / `side` | **不持久化** |
| `SidebarProvider` | `@openconsole/shadcn` | 侧边栏展开/折叠状态、移动端状态 | cookie（shadcn 处理） |

Provider 组合详见 SKILL.md 主文件。

---

## 组件 API

### ThemeSwitch

零配置主题切换按钮。使用 View Transitions API 从点击点动画展开圆形切换。

```tsx
import { ThemeSwitch } from '@openconsole/atoms'

<ThemeSwitch />
```

### Header

粘性仪表板顶部栏，设计用于与 `Sidebar` / `SidebarInset` 配对。

```tsx
import { Header } from '@openconsole/atoms'

// 默认：自动面包屑 + ThemeSwitch + Preferences 触发器
<Header />

// 自定义右侧操作
<Header
  actions={
    <>
      <SearchButton />
      <NotificationsBell />
    </>
  }
/>

// 用页面标题覆盖面包屑
<Header breadcrumbs={<h1 className="font-semibold">订单</h1>} />

// 完全隐藏面包屑
<Header breadcrumbs={false} />

// 自定义面包屑标签
<Header breadcrumbsProps={{ labels: { "/orders/123": "订单 #123" } }} />

// 隐藏内置 ThemeSwitch + Preferences
<Header hideDefaultActions actions={<MyOwnActions />} />
```

**注意**：
- 需要 `SidebarProvider`（来自 shadcn）在上方
- `actions` 在默认操作组**之前**渲染
- `breadcrumbs` 接受 `ReactNode | false | undefined`：`undefined` 渲染默认 `<Breadcrumbs />`，`false` 隐藏

### Breadcrumbs

自动从路径派生的面包屑导航。

```tsx
import { Breadcrumbs } from '@openconsole/atoms'

// 默认 — 从当前路径派生
<Breadcrumbs />

// 路径标题覆盖
<Breadcrumbs labels={{ "/orders/123": "订单 #123", "/orders": "所有订单" }} />

// 手动提供的面包屑（如向导、模态流程）
<Breadcrumbs
  items={[
    { title: "设置", link: "/settings" },
    { title: "计费", link: "/settings/billing" },
  ]}
/>

// 自定义分隔符
<Breadcrumbs separator={<span>/</span>} />

// 在移动端显示所有中间面包屑（默认：< md 隐藏）
<Breadcrumbs showAllOnMobile />
```

需要 headless 渲染时使用 `useBreadcrumbs()`：

```tsx
import { useBreadcrumbs, type Crumb } from '@openconsole/atoms'

const crumbs: Crumb[] = useBreadcrumbs({
  labels: { "/orders/123": "订单 #123" },
})
// → [{ title: "设置", link: "/settings" }, { title: "订单 #123", link: "/orders/123" }]
```

### Preferences

从右侧滑入的完整设置抽屉。内置 Tab：Theme / Layout。

```tsx
import { Preferences } from '@openconsole/atoms'
import { Button } from '@openconsole/shadcn'
import { Settings } from 'lucide-react'

function PreferencesButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <Settings />
      </Button>
      <Preferences open={open} onOpenChange={setOpen} />
    </>
  )
}
```

**前置条件**：应用根必须挂载 `ThemeProvider` + `FontProvider` + `LayoutProvider`。

### Sidebar

三段式侧边栏（brand / menu / account），自动从 `LayoutProvider` 读取配置。

```tsx
import { Sidebar } from '@openconsole/atoms'
import { SidebarInset } from '@openconsole/shadcn'

const data = {
  brand: {
    name: "Acme",
    logo: "Command",                       // lucide 图标名称
    description: "工作区 · 免费版",
  },
  menu: [
    {
      label: "主导航",
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
    // 可选下拉菜单（Profile / Billing / 退出）
    menu: [
      { label: "个人资料", icon: "User", href: "/profile" },
      { label: "计费", icon: "CreditCard", href: "/billing" },
      { label: "退出登录", icon: "LogOut", onSelect: () => signOut(), destructive: true },
    ],
  },
}

// 在 SidebarProvider 内渲染
<Sidebar {...data} />
<SidebarInset>{children}</SidebarInset>
```

**注意**：
- 数据驱动 — 不要在 JSX 中手动组装菜单项
- 图标作为字符串名称传递（`"LayoutDashboard"`），不是导入的组件
- `account.menu` 为空/省略 → 静态卡片；已填充 → 下拉触发器
- 同名冲突：`@openconsole/shadcn` 也导出 `Sidebar`。同一文件导入时需要别名

### ColorPicker

绑定到 CSS 变量的颜色输入。

```tsx
import { ColorPicker } from '@openconsole/atoms'

<ColorPicker
  label="主色"
  cssVar="--primary"
  value="oklch(0.6 0.15 250)"
  onChange={(cssVar, value) => {
    document.documentElement.style.setProperty(cssVar, value)
  }}
/>
```

### 错误页面

| 组件 | HTTP 状态 | 放置位置 |
| --- | --- | --- |
| `Unauthorized` | 401 | `app/401.tsx` |
| `Forbidden` | 403 | `app/403.tsx` |
| `NotFound` | 404 | `app/not-found.tsx` |
| `ServerError` | 500 | `app/error.tsx` |
| `Maintenance` | 503 | `app/503.tsx` |

```tsx
// app/not-found.tsx
import { NotFound } from '@openconsole/atoms'

export default function NotFoundPage() {
  return <NotFound />
}
```

---

## 与 primitives 的边界

| 任务 | atoms | shadcn primitives |
| --- | --- | --- |
| 主题切换按钮 | ✓ `ThemeSwitch` | （不要手写） |
| 设置抽屉 | ✓ `Preferences` | （不要手写 Tab + Sheet 组合） |
| 带 logo 的侧边栏 | ✓ `Sidebar` | （不要手写 Sidebar 组合） |
| 粘性顶部栏 | ✓ `Header` | （不要手写） |
| 路径派生的面包屑 | ✓ `Breadcrumbs` / `useBreadcrumbs` | 非路径型面包屑用 primitives |
| 颜色绑定输入框 | ✓ `ColorPicker` | — |
| 主题 / 字体 / 布局 providers | ✓ atoms providers | shadcn 的 `SidebarProvider` 仍必需 |
| 按钮、卡片、对话框、标签页、表单、警报、表格等 | — | ✓ |
| 多选下拉、日期范围、命令面板等 atoms 未覆盖的场景 | — | ✓ 组合 primitives |

---

## 常见陷阱

- **Provider 缺失**：`useLayout()` / `useFont()` 在对应 provider 外调用会抛出错误。`Preferences` 需要全部三个 atoms providers 在树上方。
- **忘记 shadcn 的 `SidebarProvider`**：atoms 的 `Sidebar` **不包含** `SidebarProvider`。该 primitive 必须在业务 Layout 中侧边栏所在位置挂载。
- **`Sidebar` 命名冲突**：shadcn 也导出 `Sidebar` primitive。同一文件导入时需要别名：

  ```tsx
  import { Sidebar } from '@openconsole/atoms'                    // 业务使用 atoms 的
  import { SidebarProvider, SidebarInset } from '@openconsole/shadcn' // sub-primitives 不冲突
  ```

- **图标作为字符串传递**：`Sidebar` 的 `brand.logo` 和 `menu.items[].icon` 使用字符串名称（`"LayoutDashboard"`），不是导入的组件。
- **`MenuItem.children` 只有一级深度**：不要传递三级或更多嵌套。
- **`LayoutProvider` 不持久化**：刷新重置侧边栏变体。如果需要持久化，自行包装。
- **`ThemeProvider` 已包装 next-themes**：不要嵌套单独的 `next-themes` `ThemeProvider`。使用 atoms 版本。
- **不要同时渲染 `Header` 和自定义顶部栏**：二选一。使用 `actions` 插槽扩展 `Header`。
