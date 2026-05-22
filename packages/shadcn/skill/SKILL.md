---
name: opendesign-shadcn
description: >
  使用此 skill 处理 `@opendesign/shadcn` 相关的工作 —— 在任何引用此包的应用里
  消费组件、组合布局、写表单、调样式。覆盖完整的 shadcn 原语集合（Button、
  Dialog、Form、Sidebar、Table…），`cn` / `useIsMobile` / `Icon` / `Direction`
  工具，Tailwind v4 语义化 token，以及与 `@opendesign/atoms` 的高阶 block
  集成。触发词包括"加个 button"、"搭一个 settings 页面"、"接一个 form"、
  "这不符合品牌色"、"修这个 dialog"、"让它支持无障碍"，或任何 import 了
  `@opendesign/shadcn` 的文件里的工作。
type: ui
library: "@opendesign/shadcn"
runtime:
  react: "^19"
  tailwind: "^4"
peers:
  "@opendesign/atoms": "*"
  "lucide-react": "*"
  "next-themes": "*"
  "react-hook-form": "*"
  "zod": "*"
---

# `@opendesign/shadcn` —— UI 原语组件

一个 npm 包，把整套 shadcn/ui 原语 + 一小撮工具（`cn`、`useIsMobile`、
`Icon`、`Direction`）通过单一入口导出。**你只通过 `import` 消费它 —— 不
改源码、不下载、不安装额外组件**。所有可用的组件就是它 `index.ts` 导出
的全部内容。

这个 skill 教 Claude 怎么:

1. 选对原语（用已导出的组件，不要自己造）
2. 正确组合原语（Item 一定在自己的 Group 里，Tabs 在 TabsList 里）
3. 不破坏主题地写样式（语义 token，别用裸色，别手写 `dark:` 覆盖）
4. 用 `Form` + `FieldGroup` + `Field` 接 form
5. 处理图标（`lucide-react` + `data-icon` 槽位）
6. 在 `@opendesign/atoms` 有现成高阶 block（Sider、DataTable、Preferences、
   Appearance）时优先用它

---

## 什么时候用这个 skill

满足下列任一情况就用:

- 在引用了 `@opendesign/shadcn` 的文件里写或修 UI
- 用原语拼布局（Card、Tabs、Dialog、Sidebar 等）
- 用 `react-hook-form` + `zod` 接 form（`Form`、`FormField`、`FormItem`、
  `FormControl`、`useFormField`）
- 拿不准用哪个 token / variant
- 在 `Dialog` / `Sheet` / `Drawer`、`DropdownMenu` / `Popover` /
  `HoverCard` / `ContextMenu`、`Combobox` / `Select` / `NativeSelect`
  之间纠结

**不要**用在 `@opendesign/atoms` 的高阶 block（用 atoms 自己的 skill）
或 `@opendesign/nacos`（后端集成）上。

---

## 项目上下文

| 字段 | 值 |
|---|---|
| 导入路径 | `@opendesign/shadcn`（根、平铺） |
| 工具集 | `cn`、`useIsMobile`、`Icon`、`Direction`、`Kbd`、`KbdGroup`、`Toaster` |
| 样式 | Tailwind v4 + 语义 token（`--background`、`--primary`、`--muted`…） |
| 图标库 | `lucide-react`（也通过 `Icon` 二次导出，用于按名字动态渲染） |
| 表单栈 | `react-hook-form` + `zod`（经 `@hookform/resolvers`） |
| API 风格 | 统一 **radix** 风格 —— `asChild`、`type="single"`、`defaultValue` 单选用字符串等。见 [rules/base-vs-radix.md](./rules/base-vs-radix.md) |
| 主题 | `next-themes` + `@opendesign/atoms`（`useTokens`、`useViewTransition`）管理 |
| 高阶 block | `@opendesign/atoms` —— `Sider`、`Preferences`、`ColorPicker`、`DataTable`、`Appearance`、`DatePicker`、`Combobox`、`FontProvider`、`ThemeProvider` |

> **本包是只读的**: 你不会编辑 `packages/shadcn/*.tsx`，也不会跑
> `npx shadcn@latest`。如果某个组件不存在，**不要**尝试新增 —— 选择
> 一个已有组件、或者用 `@opendesign/atoms` 的高阶 block 组合。

---

## 关键规则

下面的规则**总是被强制**。看到违反就直接修，不用先问。每条都链到一个
`Incorrect/Correct` 代码对照的细则文件。

### 样式 & Tailwind → [rules/styling.md](./rules/styling.md)

- **`className` 只管布局，不管样式**。从外面覆盖组件颜色或排版是错的。
- **不要 `space-x-*` / `space-y-*`**。改用 `flex … gap-*`。
- **宽高相等时用 `size-*`**。`size-10` 不是 `w-10 h-10`。
- **`truncate` 是简写**，不要 `overflow-hidden text-ellipsis whitespace-nowrap`。
- **别手写 `dark:` 颜色覆盖**。用语义 token（`bg-background`、`text-muted-foreground`）。
- **状态色别用裸值**。用 `Badge` variant 或 `text-destructive`，绝不
  `text-emerald-600` / `text-red-500`。
- **条件 className 用 `cn()`** —— 从 `@opendesign/shadcn` 导入。
- **overlay 别加 z-index**。`Dialog`、`Sheet`、`Drawer`、`AlertDialog`、
  `DropdownMenu`、`Popover`、`Tooltip`、`HoverCard` 自己管堆叠。

### 表单 → [rules/forms.md](./rules/forms.md)

- **表单布局用 `FieldGroup` + `Field`**。绝不要 `<div className="space-y-*">`
  这种裸 div 布局。
- **schema 用 `Form` + `FormField` + `FormItem` + `FormControl` +
  `FormMessage` 串起来**。自定义控件内部用 `useFormField()`。
- **`InputGroup` 用 `InputGroupInput` / `InputGroupTextarea`**。绝不要
  在 `InputGroup` 里塞裸 `Input` / `Textarea`。
- **输入框里的按钮用 `InputGroup` + `InputGroupAddon`**。
- **2–7 个互斥选项用 `ToggleGroup`**。
- **相关的 checkbox / radio 分组用 `FieldSet` + `FieldLegend`**。
- **校验状态: `data-invalid` 在 `Field` 上 + `aria-invalid` 在 control 上**。

### 组合 → [rules/composition.md](./rules/composition.md)

- **Item 一定在自己的 Group 里**。`SelectItem` → `SelectGroup`。
  `DropdownMenuItem` → `DropdownMenuGroup`。`CommandItem` →
  `CommandGroup`。`TabsTrigger` → `TabsList`。
- **`Dialog`、`Sheet`、`Drawer` 一定要有 Title**。视觉上不想显示就
  `className="sr-only"`。
- **`Card` 用完整组合**：`CardHeader` / `CardTitle` / `CardDescription` /
  `CardContent` / `CardFooter`。
- **`Avatar` 一定要有 `AvatarFallback`**。
- **`Button` 没有 `isLoading` prop**。用 `Spinner` + `data-icon` + `disabled` 拼。
- **自定义触发器用 `asChild`**（基于 Radix 的原语都接受）。

### 用组件，别堆裸标签 → [rules/composition.md](./rules/composition.md)

- 提示框 → `Alert`。空状态 → `Empty`。Toast → `sonner` 的 `toast()`。
- `Separator` 替代 `<hr>`。`Skeleton` 替代 `animate-pulse` div。
- `Badge` 替代加样式的 span。`Kbd` 用于键盘提示。`Spinner` 替代手写转圈。

### 图标 → [rules/icons.md](./rules/icons.md)

- **按钮里的图标用 `data-icon="inline-start"` / `"inline-end"`**。
- **组件内部图标不要加尺寸 class**。组件自己管。
- **图标当组件对象传**，别用字符串 key 查表。
- **按名字动态渲染用 `Icon`**（本包导出的 `lucide-react` 包装）。

### API 风格 → [rules/base-vs-radix.md](./rules/base-vs-radix.md)

- 本包统一 **radix** 风格 API。`asChild` 不是 `render`，`type="single"`
  不是 `multiple` 布尔，`<Slider defaultValue={[50]}>` 不是
  `defaultValue={50}` 等。

---

## 关键模式

```tsx
// 表单布局: FieldGroup + Field（不是 div + Label）
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">Email</FieldLabel>
    <Input id="email" />
  </Field>
</FieldGroup>

// react-hook-form: Form + FormField + FormItem
<Form {...form}>
  <FormField
    control={form.control}
    name="email"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Email</FormLabel>
        <FormControl>
          <Input {...field} />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
</Form>

// 校验: data-invalid 在 Field, aria-invalid 在 control
<Field data-invalid>
  <FieldLabel>Email</FieldLabel>
  <Input aria-invalid />
  <FieldDescription>Invalid email.</FieldDescription>
</Field>

// 按钮里的图标: data-icon, 不加尺寸
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

// 间距: gap, 不要 space-y / space-x
<div className="flex flex-col gap-4">  // 对
<div className="space-y-4">           // 错

// 等宽高: size-*
<Avatar className="size-10">          // 对
<Avatar className="w-10 h-10">        // 错

// 状态色: Badge variant 或语义 token
<Badge variant="secondary">+20.1%</Badge>           // 对
<span className="text-emerald-600">+20.1%</span>    // 错

// 条件 class: cn()
<div className={cn("flex items-center", isActive && "bg-primary text-primary-foreground")} />

// 不显示但 a11y-合规的 Dialog: sr-only 的 title
<Dialog>
  <DialogContent>
    <DialogTitle className="sr-only">Settings</DialogTitle>
    {/* … */}
  </DialogContent>
</Dialog>

// 加载中的按钮: Spinner + data-icon + disabled
<Button disabled={isPending}>
  {isPending && <Spinner data-icon="inline-start" />}
  Save
</Button>
```

---

## 导入

所有东西都从 `@opendesign/shadcn` 平铺导出。**入口只有这一个** ——
没有 `@opendesign/shadcn/dialog`、没有 `@opendesign/shadcn/lib/utils`、
也没有 `@/components/ui/*`。

```ts
import {
  // 原语
  Button, Badge, Avatar, AvatarFallback,
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Dialog, DialogTrigger, DialogContent, DialogTitle,
  Sheet, SheetTrigger, SheetContent, SheetTitle,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Tooltip, TooltipTrigger, TooltipContent,
  // 表单
  Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage,
  useFormField,
  FieldGroup, Field, FieldLabel, FieldDescription, FieldSet, FieldLegend,
  Input, InputGroup, InputGroupInput, InputGroupAddon,
  Select, SelectTrigger, SelectContent, SelectGroup, SelectItem, SelectValue,
  // 开关类
  Switch, Checkbox, RadioGroup, RadioGroupItem,
  ToggleGroup, ToggleGroupItem,
  // 反馈
  Alert, AlertTitle, AlertDescription,
  Empty,
  Skeleton, Spinner, Progress,
  Toaster,            // 根上挂一次，然后从 sonner 调 toast()
  // 导航
  Sidebar, SidebarProvider, SidebarTrigger,
  Breadcrumb, NavigationMenu, Pagination,
  // 浮层
  DropdownMenu, ContextMenu, Menubar, Popover, HoverCard,
  Command, CommandInput, CommandList, CommandGroup, CommandItem,
  // 工具
  cn, useIsMobile, Icon, Direction, Kbd, KbdGroup,
} from "@opendesign/shadcn";

import { toast } from "sonner";   // toast() 在 sonner 里，不在本包
```

需要某个组件但本包没导出? **不要**尝试 `npx shadcn@latest add`、
**不要**从 `@/components/ui/*` 找、**不要**复制 upstream 源码到自己的
仓库 —— 改用 `@opendesign/atoms` 的高阶 block，或者用已有原语组合。

---

## 组件选型

| 需求 | 用什么 |
|---|---|
| 按钮 / 动作 | `Button` 配合 `variant` |
| 表单输入 | `Input`、`Textarea`、`Select`、`NativeSelect`、`Checkbox`、`RadioGroup`、`Switch`、`InputOTP`、`Slider` |
| Combobox / 自动补全 | **`@opendesign/atoms`** 的 `Combobox` |
| 2–5 个互斥选项 | `ToggleGroup` |
| 数据展示 | `Table`、`Card`、`Badge`、`Avatar` |
| 可排序 / 可筛选的表格 | **`@opendesign/atoms`** 的 `DataTable` |
| 导航 | `Sidebar`（或 atoms 的 `Sider`）、`NavigationMenu`、`Breadcrumb`、`Tabs`、`Pagination` |
| 浮层 | `Dialog`（模态）、`Sheet`（侧拉）、`Drawer`（底部抽屉）、`AlertDialog`（确认） |
| 反馈 | sonner 的 `Toaster` + `toast()`、`Alert`、`Progress`、`Skeleton`、`Spinner` |
| 命令面板 | `Dialog` 里嵌 `Command` |
| 图表 | `Chart*`（包了 Recharts） |
| 布局 | `Card`、`Separator`、`Resizable`、`ScrollArea`、`Accordion`、`Collapsible`、`AspectRatio` |
| 空状态 | `Empty` |
| 菜单 | `DropdownMenu`、`ContextMenu`、`Menubar` |
| 提示 / 信息 | `Tooltip`、`HoverCard`、`Popover` |
| 日历 / 日期 | `Calendar`、**atoms** 的 `DatePicker` |
| 主题切换按钮 | **atoms** 的 `Appearance`（view-transition 圆形展开） |
| 设置抽屉 | **atoms** 的 `Preferences`（主题预设、调色板、布局、导入） |

用户说"设置页"、"仪表盘外壳"、"数据网格"、"主题切换"的时候，
**先去 `@opendesign/atoms` 找** —— 这些大多已经在那里搭好了。
有现成的高阶 block 就不要再从原语拼。

---

## 主题化

详见 [customization.md](./customization.md)。短版本:

- 主题色由 CSS 变量驱动 —— 改 `:root` / `.dark` 里的变量就改了所有组件。
- 颜色用 OKLCH（`oklch(L C H)`）。
- 加自定义色: 在 app 的全局 CSS 加 `:root` 变量 + 在 `@theme inline`
  里映射（Tailwind v4）。
- 整套主题切换用 **atoms 的 `Preferences`** 组件，它带主题预设、调色板、
  导入功能。

---

## 与伴生包的集成

| 包 | 它给你什么 |
|---|---|
| **`@opendesign/atoms`** | 基于本包原语搭出来的高阶 block —— `Sider`、`Preferences`、`ColorPicker`、`DataTable`、`Appearance`、`DatePicker`、`Combobox`、`FontProvider`、`ThemeProvider`、`SidebarConfigProvider`。**先用这些，再考虑手工拼原语**。 |
| **`@opendesign/nacos`** | 后端集成（服务注册、配置中心）。不是 UI —— 但它的 `revalidateTag` 钩子会驱动 RSC 重渲染，最后渲染出来的就是本包的组件。 |

---

## 常见坑

- **本包没有的组件，不要伪造**。不要写 `import { Calendar2 } from "@opendesign/shadcn"`
  这种碰运气的导入 —— 翻一下本文件的 [导入](#导入) 或 [组件选型](#组件选型)
  确认存在。
- **跑 `npx shadcn@latest add` / `init` / `apply`** —— 本包是 npm 包，
  不参与官方 shadcn CLI 流程。
- **从 `@/components/ui/*` 或 `@opendesign/shadcn/<subpath>` 导入** ——
  入口只有 `@opendesign/shadcn` 根。
- **wrapper 用了 `useState` / `useEffect` / `onClick` 却忘了 `"use client"`** ——
  每个交互原语本身已经标了，但你自己包出来的 wrapper 要自己加。
- **给 `DialogContent` 加 `z-50`** —— Radix 自己分层。手写 z-index
  会破坏跟 `Tooltip` / `Toaster` 的堆叠顺序。
- **手写 `dark:bg-*`** —— 跟主题 token 打架。用 `bg-background`、
  `bg-muted`、`bg-card` 等。
- **`SelectItem` 写在 `SelectGroup` 外面** —— TS 检查能过，
  键盘导航和屏幕阅读器都坏。
- **`Dialog` 没有 `DialogTitle`** —— Radix 会打 a11y warning。
  不想显示就 `<DialogTitle className="sr-only">…</DialogTitle>`。
- **主题切换读 `theme` 而不是 `resolvedTheme`** —— 用户处于
  System 模式时 `theme === "system"`，naive 的
  `theme === "dark" ? "light" : "dark"` 切换第一次点会无动作。
  用 atoms 的 `useViewTransition`（它读 `resolvedTheme`）。

---

## 详细参考

- [rules/styling.md](./rules/styling.md) —— 语义色、variant、`className`、间距、`size-*`、`truncate`、暗色、`cn()`、z-index。
- [rules/forms.md](./rules/forms.md) —— `FieldGroup`、`Field`、`InputGroup`、`ToggleGroup`、`FieldSet`、校验状态、react-hook-form 整合。
- [rules/composition.md](./rules/composition.md) —— Group、overlay、`Card`、`Tabs`、`Avatar`、`Alert`、`Empty`、toast、`Separator`、`Skeleton`、`Badge`、按钮加载态。
- [rules/icons.md](./rules/icons.md) —— `data-icon`、图标尺寸、图标作为对象传递、`Icon` 名字查找。
- [rules/base-vs-radix.md](./rules/base-vs-radix.md) —— 本包 radix 风格 API 速查（`asChild`、`Select`、`ToggleGroup`、`Slider`、`Accordion`）。
- [customization.md](./customization.md) —— 主题、CSS 变量、新增自定义色。
- [Tailwind v4 主题文档](https://tailwindcss.com/docs/theme)。
