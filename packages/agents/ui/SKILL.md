---
name: ui
description: |
  公司内部 Next.js 项目的 UI 组件使用规范,自包含完整定义。基础原语来自 `@openconsole/shadcn`(60+ shadcn/ui 组件 + 主题 token + `cn()`),业务级组件来自 `@openconsole/atoms`(`Header` / `Sidebar` / `Breadcrumbs` / `Preferences` / `ColorPicker` / `ThemeSwitch` + 5 个错误页 + 4 个防闪烁 Provider)。唯一图标库是 `lucide-react`。

  必须在以下场景触发,即使用户没说出 skill 名:用 UI 组件 / 加 Button / 加 Dialog / 加 Sheet / 加 Drawer / 加 Card / 加 Table / 加 Tabs / 加 Form / 加 Avatar / 加 Badge / 加 Skeleton / 加 Alert / 加 Empty / 加 Command / 改 sidebar / 加 Header / 加 Breadcrumbs / 加 Preferences / 加 ColorPicker / 加 ThemeSwitch / 主题切换 / 明暗模式 / dark mode / 改主题色 / 加品牌色 / 加字体 / Inter / Manrope / Geist / 防闪烁 / SidebarProvider / LayoutProvider 闪一下 / cookie 防闪烁 / 加图标 / 用 lucide / 加错误页 / NotFound / Unauthorized / Forbidden / ServerError / Maintenance / 加 data-icon / size-* / cn() / Tailwind class / semantic token / @theme inline。

  **禁止**:`pnpm add shadcn-ui` / `npx shadcn add` / 拷贝 shadcn 源码到 `components/ui/` / 用 MUI / antd / Chakra / Mantine / react-icons / heroicons / 自己写 `cn()` / 写 hex 字面量颜色 / 在项目里二次覆盖 `--primary` token。

  全局架构约束见同目录 `AGENTS.md`;通用 Next 写法走 `nextjs-best-practices` skill。
---

# UI 组件规范

## 双包架构

| 包 | 职责 | 导入 |
|---|---|---|
| `@openconsole/shadcn` | 60+ 基础组件（primitives） | `import { Button } from '@openconsole/shadcn'` |
| `@openconsole/atoms` | 高阶业务组件 | `import { Header } from '@openconsole/atoms'` |

**禁止直接下载 shadcn 组件**：
- ✗ `npx shadcn@latest add button`
- ✗ 从 shadcn/ui 官网复制组件代码
- ✗ 使用其他 UI 库（Material UI, Chakra UI, Ant Design 等）

---

## Critical Rules

### 样式与 Tailwind → [styling.md](./rules/styling.md)

- **`className` 用于布局，不用于样式**
- **禁止 `space-x-*` / `space-y-*`**：使用 `flex gap-*`
- **等宽高用 `size-*`**：`size-10` 而不是 `w-10 h-10`
- **使用 `truncate` 简写**
- **禁止手动 `dark:` 颜色覆盖**：使用语义 token
- **条件类用 `cn()`**
- **覆盖组件禁止手动 `z-index`**

### 表单与输入 → [forms.md](./rules/forms.md)

- **表单使用 `FieldGroup` + `Field`**
- **`InputGroup` 使用 `InputGroupInput` / `InputGroupTextarea`**
- **2-7 个选项用 `ToggleGroup`**
- **相关字段分组用 `FieldSet` + `FieldLegend`**
- **字段验证使用 `data-invalid` + `aria-invalid`**

### 组件结构 → [composition.md](./rules/composition.md)

- **项必须在 Group 内**
- **Dialog、Sheet、Drawer 必须有 Title**
- **使用完整 Card 组合**
- **Button 没有 `isPending` / `isLoading`**
- **`Avatar` 必须有 `AvatarFallback`**

### 图标 → [icons.md](./rules/icons.md)

- **Button 内图标使用 `data-icon`**
- **组件内图标不加尺寸类**
- **图标作为对象传递**

### Provider 组合与 atoms → [foundation.md](./rules/foundation.md)

详见 [foundation.md](./rules/foundation.md)。

---

## 关键模式

```tsx
// 表单布局
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">邮箱</FieldLabel>
    <Input id="email" />
  </Field>
</FieldGroup>

// Button 图标
<Button>
  <SearchIcon data-icon="inline-start" />
  搜索
</Button>

// 间距
<div className="flex flex-col gap-4">  // 正确
<div className="space-y-4">           // 错误

// 等宽高
<Avatar className="size-10">   // 正确
<Avatar className="w-10 h-10"> // 错误

// 状态颜色
<Badge variant="secondary">+20.1%</Badge>    // 正确
<span className="text-emerald-600">+20.1%</span> // 错误
```

---

## Providers

| Provider | 来自 | 作用 |
|---|---|---|
| `ThemeProvider` | `@openconsole/atoms` | 亮/暗/系统主题(包装 next-themes) |
| `FontProvider` | `@openconsole/atoms` | 活跃字体(localStorage 持久化) |
| `LayoutProvider` | `@openconsole/atoms` | 侧边栏变体配置(cookie 持久化 + 服务端读 + 首屏防闪烁) |
| `SidebarProvider` | `@openconsole/atoms` | 侧边栏展开/收起(cookie 持久化 + 服务端读 + 首屏防闪烁) |

> ⚠️ `SidebarProvider` **必须**从 `@openconsole/atoms` 引入,**不要**从
> `@openconsole/shadcn` —— atoms 版本在服务端读 cookie 还原状态,首屏
> 即终态;shadcn 原版只写不读,刷新会闪烁。

详见 [foundation.md](./rules/foundation.md) 与 [theme.md](./rules/theme.md)。

---

## 组件选择表

### atoms 高阶组件

| 需求 | 使用 |
|---|---|
| 主题切换按钮 | `ThemeSwitch` |
| 应用布局壳 | `Header` + `Sidebar` + `SidebarInset` |
| 面包屑导航 | `Breadcrumbs` / `useBreadcrumbs()` |
| 设置抽屉 | `Preferences` |
| 颜色选择器 | `ColorPicker` |
| 错误页面 | `NotFound` (404), `Unauthorized` (401), `Forbidden` (403), `ServerError` (500), `Maintenance` (503) |

### shadcn 基础组件

| 需求 | 使用 |
|---|---|
| 按钮 / 操作 | `Button` + variant |
| 表单输入 | `Input`, `Select`, `Switch`, `Checkbox`, `RadioGroup`, `Textarea`, `InputOTP`, `Slider`, `NativeSelect`(无 JS 也工作) |
| 可搜索下拉 | **不是一个组件** —— 自己拼 `Popover` + `Command`(参见 `forms.md` "可搜索下拉"段) |
| 按钮组 | `ButtonGroup`, `ButtonGroupSeparator`, `ButtonGroupText`(横向 / 纵向连排按钮) |
| 列表项 | `Item`, `ItemGroup`, `ItemMedia`, `ItemContent`, `ItemActions`, `ItemHeader`, `ItemFooter`, `ItemTitle`, `ItemDescription`, `ItemSeparator`(非表格的列表 UI) |
| 键盘快捷键 | `Kbd`, `KbdGroup`(显示 `⌘K` 等,常在 menu / command 里) |
| 媒体比例 | `AspectRatio`(锁定图片 / 视频 / iframe 的长宽比) |
| RTL / LTR 方向 | `DirectionProvider`, `useDirection`(需要双向布局时) |
| Icon 渲染 | `<Icon name="LayoutDashboard" />`(把 lucide 字符串名查表渲染;`Sidebar` 内部用) |
| 2-5 个选项切换 | `ToggleGroup` + `ToggleGroupItem` |
| 数据展示 | `Table`, `Card`, `Badge`, `Avatar`, `Skeleton`, `Progress` |
| 导航 | `Sidebar`, `NavigationMenu`, `Breadcrumb`, `Tabs`, `Pagination`, `Menubar` |
| 覆盖层 | `Dialog`, `Sheet`, `Drawer`, `AlertDialog`, `Popover`, `Tooltip`, `HoverCard` |
| 反馈 | `sonner`, `Alert`, `Spinner` |
| 命令面板 | `Command` + `Dialog` |
| 图表 | `Chart` |
| 布局 | `Separator`, `Resizable`, `ScrollArea`, `Accordion`, `Collapsible` |
| 空状态 | `Empty` |
| 菜单 | `DropdownMenu`, `ContextMenu` |
| 表单组合 | `Form`, `Field`, `FieldGroup`, `Label` |

---

## 详细参考

- [rules/styling.md](./rules/styling.md) — 语义颜色、间距、size、truncate、cn()、z-index
- [rules/forms.md](./rules/forms.md) — FieldGroup、Field、InputGroup、ToggleGroup、FieldSet
- [rules/composition.md](./rules/composition.md) — Groups、Card、Avatar、Alert、Empty、Toast
- [rules/icons.md](./rules/icons.md) — data-icon、图标传递
- [rules/foundation.md](./rules/foundation.md) — Provider 组合、Layout 结构、atoms 高阶组件 API
- [rules/theme.md](./rules/theme.md) — 品牌主色 #17b3a3、字体、明暗主题、布局、防闪烁
- [rules/library-whitelist.md](./rules/library-whitelist.md) — UI 库白名单 + 黑名单 + 决策树 + FAQ
