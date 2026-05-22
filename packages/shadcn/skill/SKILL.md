---
name: openclound-shadcn
description: >
  `@openclound/shadcn` 的使用指南。完整的 shadcn UI 原语集合（Button、
  Dialog、Form、Sidebar、Table、Card、Tabs 等），`cn` / `useIsMobile` /
  `Icon` / `Direction` 工具，Tailwind v4 语义化 token。
  适用场景包括: 搭建页面与表单、选择正确的组件原语、修复样式问题、
  组合复杂交互（设置页、数据表格、仪表盘、命令面板、抽屉、确认对话框
  等）、应用主题与品牌色。
type: ui
library: "@openclound/shadcn"
runtime:
  react: "^19"
  tailwind: "^4"
peers:
  "lucide-react": "*"
  "next-themes": "*"
  "react-hook-form": "*"
  "zod": "*"
---

# `@openclound/shadcn` —— UI 原语组件

一个 npm 包，把整套 shadcn/ui 原语 + 一小撮工具（`cn`、`useIsMobile`、
`Icon`、`Direction`）通过单一入口 `@openclound/shadcn` 平铺导出。

本包是**只读消费**：所有可用的组件就是 `index.ts` 导出的全部内容。
没有 CLI、没有源码改动、不需要额外安装。

本文档覆盖:

1. 怎么从用户的口语化需求识别到正确的组件（[应用场景速查](#应用场景速查)）
2. 选对原语和正确组合（Item 在 Group 里、Tabs 在 TabsList 里等）
3. 不破坏主题地写样式（语义 token，不裸用色，不手写 `dark:`）
4. 用 `Form` + `FieldGroup` + `Field` 接表单
5. 处理图标（`lucide-react` + `data-icon` 槽位）
6. 调用本包组件时正确的 prop 形状（[rules/base-vs-radix.md](./rules/base-vs-radix.md)）
7. 主题化与扩展边界（[customization.md](./customization.md)）

---

## 项目上下文

| 字段 | 值 |
|---|---|
| 导入路径 | `@openclound/shadcn`（唯一入口） |
| 工具集 | `cn`、`useIsMobile`、`Icon`、`Direction`、`Kbd`、`KbdGroup`、`Toaster` |
| 样式 | Tailwind v4 + 语义 token（`--background`、`--primary`、`--muted`…） |
| 图标库 | `lucide-react`（也通过 `Icon` 二次导出，用于按名字动态渲染） |
| 表单栈 | `react-hook-form` + `zod`（经 `@hookform/resolvers`） |
| API 风格 | 统一 `asChild`、`type="single"` 显式、`Slider` 用数组等。见 [rules/base-vs-radix.md](./rules/base-vs-radix.md) |
| 主题 | 配合 `next-themes` 做亮 / 暗切换；语义 token 自动跟随 |

---

## 应用场景速查

用户用自然语言描述需求时，按下表识别意图，挑出本包中正确的组件。

| 用户描述（关键词） | 选这个 | 关键组合 |
|---|---|---|
| "搭一个登录页 / 注册表单 / 创建表单" | `Card` + `Form` | Card 包外层 → CardHeader + CardContent → `Form` + `FormField` + `FormItem` + `FormLabel` + `FormControl(Input)` + `FormMessage` |
| "设置页 / 偏好 / Profile" | `Tabs` + `Field` | Tabs 分组 → 每页用 `Field orientation="horizontal"` + `Switch`/`Select`/`Input` |
| "用户列表 / 数据表格 / 列表" | `Table` | TableHeader / TableRow / TableCell；要排序筛选，应用层接 `@tanstack/react-table` |
| "纯展示表格" | `Table` | 见上 |
| "仪表盘 / Dashboard / 首页指标" | `Card` 网格 + `Chart*` + `Badge` | Card 拼数据卡 → Chart 系列展可视化 → Badge 标状态 |
| "用户头像下拉菜单" | `Avatar` + `DropdownMenu` | DropdownMenuTrigger(asChild) → Avatar + AvatarFallback → DropdownMenuContent → DropdownMenuGroup → DropdownMenuItem |
| "删除确认 / 二次确认" | `AlertDialog` | AlertDialogTrigger + AlertDialogContent + AlertDialogFooter + AlertDialogAction(Button variant="destructive") |
| "侧拉面板 / 详情抽屉 / 筛选侧栏" | `Sheet` | `<Sheet>` + `<SheetContent side="right">` |
| "移动端底部抽屉 / 半屏" | `Drawer` | Drawer + DrawerContent |
| "主框架 / 后台外壳" | `SidebarProvider` + `Sidebar` | SidebarProvider 包根 → Sidebar + SidebarMenu + SidebarMenuItem 拼侧栏 → main 区域是主内容 |
| "空状态 / 暂无数据" | `Empty` | Empty → EmptyHeader → EmptyMedia + EmptyTitle + EmptyDescription → EmptyContent(Button) |
| "加载中骨架" | `Skeleton` | 拼网格匹配实际布局 |
| "加载中转圈" | `Spinner` | 在按钮里配 `data-icon` + `disabled` |
| "命令面板 / 快速跳转 / Cmd+K" | `Dialog` + `Command` | Dialog 包外，里面 Command + CommandInput + CommandList + CommandGroup + CommandItem |
| "下拉菜单（点开）" | `DropdownMenu` | 点击触发 |
| "右键菜单" | `ContextMenu` | 长按 / 右键触发 |
| "应用顶部菜单条" | `Menubar` | 类 macOS 顶部菜单 |
| "面包屑导航" | `Breadcrumb` | BreadcrumbList → BreadcrumbItem → BreadcrumbLink |
| "分页" | `Pagination` | PaginationContent → PaginationItem → PaginationLink/Previous/Next |
| "标签页" | `Tabs` | Tabs → TabsList → TabsTrigger → TabsContent |
| "可折叠区块" | `Collapsible`（单个）或 `Accordion`（多个分组） | Accordion 用于 FAQ；Collapsible 用于单个开关区 |
| "悬浮提示" | `Tooltip` | TooltipTrigger + TooltipContent，可配 `Kbd` |
| "悬浮卡片 / 用户名 hover 预览" | `HoverCard` | HoverCardTrigger + HoverCardContent |
| "点击弹出小卡片 / 颜色 / 日期" | `Popover` | PopoverTrigger + PopoverContent |
| "Toast / 通知 / 短反馈" | `toast()` from `sonner` | 根上挂一次 `<Toaster />`，业务里直接调 `toast.success(...)` |
| "进度条" | `Progress` | 已知进度用 Progress；未知用 Spinner |
| "标签 / 状态徽章" | `Badge` | variant: default / secondary / destructive / outline |
| "可搜索下拉 / 自动补全" | `Popover` + `Command` | PopoverTrigger 触发 → PopoverContent 包 Command + CommandInput + CommandList |
| "下拉选项（不搜索）" | `Select` | inline SelectItem，详见 [rules/base-vs-radix.md](./rules/base-vs-radix.md) |
| "日期选择器" | `Popover` + `Calendar` | PopoverTrigger(Button) → PopoverContent 包 Calendar |
| "纯日历视图" | `Calendar` | 渲染月历 |
| "主题切换按钮" | `Button` + `next-themes` | 见下 [完整代码示例](#场景--完整代码示例) |
| "设置抽屉（侧拉式）" | `Sheet` | Sheet + SheetContent 包 Tabs / Field 表单 |
| "OTP / 验证码输入" | `InputOTP` | 4-6 位分格输入 |
| "评分滑块 / 调音量" | `Slider` | **value 必须是数组**: `[50]` 不是 `50` |
| "可调整大小的面板" | `Resizable` | ResizablePanelGroup + ResizablePanel + ResizableHandle |
| "长内容滚动" | `ScrollArea` | 自定义滚动条样式 |
| "图片占位（保持比例）" | `AspectRatio` | 包图片避免布局抖动 |
| "辐射 / 分割" | `Separator` | 替代 `<hr>` 和带 border 的 div |
| "图标按钮分组" | `ButtonGroup` 或 `ToggleGroup` | 互斥用 `ToggleGroup type="single"`；并列动作用 `ButtonGroup` |

### 场景 → 完整代码示例

#### 登录表单

```tsx
<Card className="mx-auto max-w-sm">
  <CardHeader>
    <CardTitle>登录</CardTitle>
    <CardDescription>使用邮箱和密码登录</CardDescription>
  </CardHeader>
  <CardContent>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>邮箱</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>密码</FormLabel>
              <FormControl><Input type="password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner data-icon="inline-start" />}
          登录
        </Button>
      </form>
    </Form>
  </CardContent>
</Card>
```

#### 删除确认

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">删除项目</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认删除?</AlertDialogTitle>
      <AlertDialogDescription>
        此操作不可撤销。项目下的所有数据会一并删除。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction onClick={onConfirm}>删除</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

#### 命令面板（Cmd+K）

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="p-0">
    <DialogTitle className="sr-only">命令面板</DialogTitle>
    <Command>
      <CommandInput placeholder="输入命令或搜索..." />
      <CommandList>
        <CommandEmpty>没有匹配结果。</CommandEmpty>
        <CommandGroup heading="导航">
          <CommandItem onSelect={() => router.push("/dashboard")}>
            <LayoutDashboardIcon />
            仪表盘
          </CommandItem>
          <CommandItem onSelect={() => router.push("/settings")}>
            <SettingsIcon />
            设置
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  </DialogContent>
</Dialog>
```

#### 仪表盘数据卡

```tsx
<div className="grid gap-4 md:grid-cols-3">
  <Card>
    <CardHeader>
      <CardDescription>总营收</CardDescription>
      <CardTitle className="text-3xl">¥45,231</CardTitle>
    </CardHeader>
    <CardFooter>
      <Badge variant="secondary">+20.1% 较上月</Badge>
    </CardFooter>
  </Card>
  <Card>
    <CardHeader>
      <CardDescription>活跃用户</CardDescription>
      <CardTitle className="text-3xl">2,350</CardTitle>
    </CardHeader>
    <CardFooter>
      <Badge variant="secondary">+18.1% 较上月</Badge>
    </CardFooter>
  </Card>
  <Card>
    <CardHeader>
      <CardDescription>转化率</CardDescription>
      <CardTitle className="text-3xl">3.2%</CardTitle>
    </CardHeader>
    <CardFooter>
      <span className="text-destructive text-sm">-2.4% 较上月</span>
    </CardFooter>
  </Card>
</div>
```

#### 用户头像下拉

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" className="size-8 rounded-full p-0">
      <Avatar className="size-8">
        <AvatarImage src={user.avatar} alt={user.name} />
        <AvatarFallback>{user.initials}</AvatarFallback>
      </Avatar>
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuGroup>
      <DropdownMenuItem onSelect={() => router.push("/profile")}>
        <UserIcon />
        个人资料
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => router.push("/settings")}>
        <SettingsIcon />
        设置
      </DropdownMenuItem>
    </DropdownMenuGroup>
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={signOut}>
      <LogOutIcon />
      退出
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

#### 空状态

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><FolderIcon /></EmptyMedia>
    <EmptyTitle>还没有项目</EmptyTitle>
    <EmptyDescription>创建你的第一个项目开始使用。</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>新建项目</Button>
  </EmptyContent>
</Empty>
```

#### 设置页（分页布局）

```tsx
<Tabs defaultValue="account" className="flex flex-col gap-6">
  <TabsList>
    <TabsTrigger value="account">账户</TabsTrigger>
    <TabsTrigger value="notifications">通知</TabsTrigger>
    <TabsTrigger value="appearance">外观</TabsTrigger>
  </TabsList>
  <TabsContent value="account">
    <FieldGroup>
      <Field orientation="horizontal">
        <FieldLabel>姓名</FieldLabel>
        <Input defaultValue={user.name} />
      </Field>
      <Field orientation="horizontal">
        <FieldLabel>邮箱</FieldLabel>
        <Input type="email" defaultValue={user.email} />
      </Field>
    </FieldGroup>
  </TabsContent>
  <TabsContent value="notifications">
    <FieldSet>
      <FieldLegend>邮件通知</FieldLegend>
      <FieldGroup>
        <Field orientation="horizontal">
          <Switch id="weekly" />
          <FieldLabel htmlFor="weekly">每周摘要</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Switch id="security" />
          <FieldLabel htmlFor="security">安全提醒</FieldLabel>
        </Field>
      </FieldGroup>
    </FieldSet>
  </TabsContent>
</Tabs>
```

#### 主题切换按钮

```tsx
"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@openclound/shadcn";

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

#### 可搜索下拉

```tsx
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" role="combobox" aria-expanded={open} className="w-[200px] justify-between">
      {value ? options.find((o) => o.value === value)?.label : "选择..."}
      <ChevronsUpDownIcon data-icon="inline-end" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-[200px] p-0">
    <Command>
      <CommandInput placeholder="搜索..." />
      <CommandList>
        <CommandEmpty>没有匹配项。</CommandEmpty>
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option.value}
              onSelect={() => {
                setValue(option.value);
                setOpen(false);
              }}
            >
              <CheckIcon className={cn("mr-2", value === option.value ? "opacity-100" : "opacity-0")} />
              {option.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

#### 日期选择器

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" className={cn("justify-start text-left font-normal", !date && "text-muted-foreground")}>
      <CalendarIcon data-icon="inline-start" />
      {date ? format(date, "PPP") : "选择日期"}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0">
    <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
  </PopoverContent>
</Popover>
```

---

## 关键规则

下面的规则**总是被强制**。看到违反就直接修。每条都链到一个
Incorrect/Correct 代码对照的细则文件。

### 样式 & Tailwind → [rules/styling.md](./rules/styling.md)

- **`className` 只管布局，不管样式**。从外面覆盖组件颜色或排版是错的。
- **不要 `space-x-*` / `space-y-*`**。改用 `flex … gap-*`。
- **宽高相等时用 `size-*`**。`size-10` 不是 `w-10 h-10`。
- **`truncate` 是简写**，不要 `overflow-hidden text-ellipsis whitespace-nowrap`。
- **别手写 `dark:` 颜色覆盖**。用语义 token。
- **状态色别用裸值**。用 `Badge` variant 或 `text-destructive`。
- **条件 className 用 `cn()`**（从 `@openclound/shadcn` 导入）。
- **overlay 别加 z-index**（`Dialog`、`Popover`、`Tooltip` 等自管堆叠）。

### 表单 → [rules/forms.md](./rules/forms.md)

- **表单布局用 `FieldGroup` + `Field`**，绝不要 `<div className="space-y-*">`。
- **schema 用 `Form` + `FormField` + `FormItem` + `FormControl` + `FormMessage`**。
- **`InputGroup` 用 `InputGroupInput` / `InputGroupTextarea`**。
- **输入框里的按钮用 `InputGroup` + `InputGroupAddon`**。
- **2–7 个互斥选项用 `ToggleGroup`**。
- **相关 checkbox / radio 分组用 `FieldSet` + `FieldLegend`**。
- **校验状态: `data-invalid` 在 `Field` + `aria-invalid` 在 control**。

### 组合 → [rules/composition.md](./rules/composition.md)

- **Item 一定在自己的 Group 里**（`SelectItem` → `SelectGroup`，
  `DropdownMenuItem` → `DropdownMenuGroup`，`CommandItem` →
  `CommandGroup`，`TabsTrigger` → `TabsList`）。
- **`Dialog` / `Sheet` / `Drawer` 一定要有 Title**（视觉隐藏用 `className="sr-only"`）。
- **`Card` 用完整组合**: `CardHeader` / `CardTitle` / `CardDescription` /
  `CardContent` / `CardFooter`。
- **`Avatar` 必须有 `AvatarFallback`**。
- **`Button` 没有 `isLoading` prop**: 用 `Spinner` + `data-icon` + `disabled` 拼。
- **自定义触发器用 `asChild`**。

### 用组件，别堆裸标签 → [rules/composition.md](./rules/composition.md)

- 提示框 → `Alert`。空状态 → `Empty`。Toast → `sonner` 的 `toast()`。
- `Separator` 替代 `<hr>`。`Skeleton` 替代 `animate-pulse` div。
- `Badge` 替代加样式的 span。`Kbd` 用于键盘提示。`Spinner` 替代手写转圈。

### 图标 → [rules/icons.md](./rules/icons.md)

- **按钮里的图标用 `data-icon="inline-start"` / `"inline-end"`**。
- **组件内部图标不要加尺寸 class**（组件自管）。
- **图标当组件对象传**，别用字符串 key 查表。
- **按名字动态渲染用 `Icon`**（本包导出的 `lucide-react` 包装）。

### API 形状 → [rules/base-vs-radix.md](./rules/base-vs-radix.md)

- 自定义 trigger 用 `asChild`。
- `ToggleGroup` / `Accordion` 显式 `type="single"` 或 `type="multiple"`。
- `Slider` 的 `value` 永远是数组。
- `Select` 用 inline `<SelectItem>`，placeholder 在 `<SelectValue>` 上。

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
<div className="flex flex-col gap-4">

// 等宽高: size-*
<Avatar className="size-10">

// 状态色: Badge variant 或语义 token
<Badge variant="secondary">+20.1%</Badge>

// 条件 class: cn()
<div className={cn("flex items-center", isActive && "bg-primary text-primary-foreground")} />

// 不显示但 a11y-合规的 Dialog: sr-only 的 title
<Dialog>
  <DialogContent>
    <DialogTitle className="sr-only">Settings</DialogTitle>
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

所有东西从 `@openclound/shadcn` 平铺导出，**入口只有这一个**。

```ts
import {
  // 原语
  Button, Badge, Avatar, AvatarImage, AvatarFallback,
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Dialog, DialogTrigger, DialogContent, DialogTitle,
  Sheet, SheetTrigger, SheetContent, SheetTitle,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Tooltip, TooltipTrigger, TooltipContent,
  Popover, PopoverTrigger, PopoverContent,
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
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent,
  Skeleton, Spinner, Progress,
  Toaster,            // 根上挂一次，然后从 sonner 调 toast()
  // 导航
  Sidebar, SidebarProvider, SidebarTrigger, SidebarMenu, SidebarMenuItem,
  Breadcrumb, NavigationMenu, Pagination,
  // 浮层
  DropdownMenu, ContextMenu, Menubar, HoverCard,
  Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty,
  // 日期
  Calendar,
  // 工具
  cn, useIsMobile, Icon, Direction, Kbd, KbdGroup,
} from "@openclound/shadcn";

import { toast } from "sonner";   // toast() 在 sonner 里，不在本包
```

需要某个组件但本包没导出 —— 不要碰运气拼 import 路径，也不要从别处
复制源码进来。在应用层用已有原语自己组合。

---

## 主题化

详见 [customization.md](./customization.md)。短版本:

- 主题色由 CSS 变量驱动 —— 改 `:root` / `.dark` 里的变量就改了所有组件。
- 颜色用 OKLCH（`oklch(L C H)`）。
- 加自定义色: 在 app 的全局 CSS 加 `:root` 变量 + 在 `@theme inline`
  里映射（Tailwind v4）。
- 亮 / 暗切换用 `next-themes` 的 `ThemeProvider` 包根 + `useTheme()`
  钩子写自己的切换按钮。

---

## 常见坑

- **本包没有的组件不要伪造**: `import { Calendar2 } from "@openclound/shadcn"`
  这种碰运气的 import 永远不会成功。先翻 [导入](#导入) 或
  [应用场景速查](#应用场景速查) 确认。
- **入口只有 `@openclound/shadcn` 根**: 不存在 `@openclound/shadcn/dialog`、
  `@openclound/shadcn/lib/utils` 这种 subpath import。
- **wrapper 用了 `useState` / `useEffect` / `onClick` 却忘了 `"use client"`**:
  每个交互原语本身已经标了，但你自己包出来的 wrapper 要自己加。
- **给 `DialogContent` 加 `z-50`**: 浮层组件自己分层。手写 z-index 会
  破坏跟 `Tooltip` / `Toaster` 的堆叠顺序。
- **手写 `dark:bg-*`**: 跟主题 token 打架。用 `bg-background`、
  `bg-muted`、`bg-card` 等。
- **`SelectItem` 写在 `SelectGroup` 外面**: TS 检查能过，但键盘导航
  和屏幕阅读器都坏。
- **`Dialog` 没有 `DialogTitle`**: 屏幕阅读器会报缺标题。不想显示就
  `<DialogTitle className="sr-only">…</DialogTitle>`。
- **主题切换读 `theme` 而不是 `resolvedTheme`**: 用户处于 System 模式
  时 `theme === "system"`，naive 的 `theme === "dark" ? "light" : "dark"`
  第一次点会无动作。读 `resolvedTheme` 来决定切到哪边。

---

## 详细参考

- [rules/styling.md](./rules/styling.md) —— 语义色、variant、`className`、间距、`size-*`、`truncate`、暗色、`cn()`、z-index。
- [rules/forms.md](./rules/forms.md) —— `FieldGroup`、`Field`、`InputGroup`、`ToggleGroup`、`FieldSet`、校验状态、react-hook-form 整合。
- [rules/composition.md](./rules/composition.md) —— Group、overlay、`Card`、`Tabs`、`Avatar`、`Alert`、`Empty`、toast、`Separator`、`Skeleton`、`Badge`、按钮加载态。
- [rules/icons.md](./rules/icons.md) —— `data-icon`、图标尺寸、图标作为对象传递、`Icon` 名字查找。
- [rules/base-vs-radix.md](./rules/base-vs-radix.md) —— 本包 API 速查（`asChild`、`Select`、`ToggleGroup`、`Slider`、`Accordion`）。
- [customization.md](./customization.md) —— 主题、CSS 变量、新增自定义色。
