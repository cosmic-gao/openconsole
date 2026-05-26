# UI Rules —— 组件白名单与严格约束

> 模板对 UI 库的限制是「闭集」:**只允许** `@openconsole/atoms` + `@openconsole/shadcn` +
> `lucide-react`。任何其它 UI 库都不允许。本文写清楚为什么、能做什么、不能做什么、
> 真的需要新组件时怎么走流程。

---

## 白名单(唯一允许导入的 UI 来源)

| 包 | 提供 | 用法 |
| --- | --- | --- |
| `@openconsole/shadcn` | shadcn/ui 全集 + 主题 token + `cn()` / `<Icon>` / `useIsMobile()` | 平铺导入,**不要**走子路径 |
| `@openconsole/atoms` | 业务级:`<Header>` / `<Sidebar>` / `<Breadcrumbs>` / `<ThemeProvider>` / `<FontProvider>` / `<LayoutProvider>` / `<SidebarProvider>` / `<Preferences>` / `<ColorPicker>` / `<ThemeSwitch>` / 五个错误页(`<Unauthorized>` / `<Forbidden>` / `<NotFound>` / `<ServerError>` / `<Maintenance>`) | 平铺导入 |
| `lucide-react` | 唯一图标库 | 真组件 `import { LayoutDashboard }` / 字符串名 `"LayoutDashboard"`(传 RSC ↔ Client) |

### 正确导入示范

```ts
import {
  // shadcn 基础原语
  Button, Input, Card, CardHeader, CardTitle, CardContent,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Table, TableHeader, TableBody, TableRow, TableCell, TableHead,
  Tabs, TabsList, TabsTrigger, TabsContent,
  // 工具
  cn,
  Toaster,
  useIsMobile,
} from "@openconsole/shadcn";

import {
  // 业务级组件
  Header, Sidebar, Breadcrumbs,
  ThemeProvider, FontProvider, LayoutProvider, SidebarProvider,
  Preferences, ThemeSwitch, ColorPicker,
  // 错误页
  Unauthorized, Forbidden, NotFound, ServerError, Maintenance,
  // hook
  useLayout, useFont, useBreadcrumbs,
} from "@openconsole/atoms";

import { LayoutDashboard, Settings, NotebookPen } from "lucide-react";
```

### shadcn 完整导出清单(`@openconsole/shadcn` latest)

按字母序,所有都可以从根 `@openconsole/shadcn` 平铺导入:

| 组件 / 工具 | 用途简述 |
| --- | --- |
| `Accordion` 系列 | 折叠面板 |
| `Alert` / `AlertTitle` / `AlertDescription` | 横幅提示 |
| `AlertDialog` 系列 | 销毁性确认对话框 |
| `AspectRatio` | 锁定长宽比的容器(图片 / 视频 / iframe) |
| `Avatar` / `AvatarImage` / `AvatarFallback` | 头像 |
| `Badge` | 状态徽章 |
| `Breadcrumb` 系列 | 面包屑(底层原语;atoms 的 `<Breadcrumbs>` 是它的智能封装) |
| `Button` / `buttonVariants` | 按钮 |
| `ButtonGroup` / `ButtonGroupSeparator` / `ButtonGroupText` | 连排按钮组 |
| `Calendar` | 日历(react-day-picker) |
| `Card` 系列 | 卡片 |
| `Carousel` 系列 | 走马灯(embla) |
| `Chart` / `ChartContainer` / `ChartTooltip` 等 | recharts 主题集成 |
| `Checkbox` | 复选框 |
| `Collapsible` 系列 | 单段折叠 |
| `Command` 系列(`CommandInput` / `CommandItem` / `CommandGroup` …) | 命令面板(cmdk),组合 `Popover` 即 Combobox |
| `ContextMenu` 系列 | 右键菜单 |
| `Dialog` 系列 | 模态对话框 |
| `DirectionProvider` / `useDirection` | RTL / LTR(需要双向布局再用) |
| `Drawer` 系列(vaul) | 移动端友好的底部抽屉 |
| `DropdownMenu` 系列 | 下拉菜单 |
| `Empty` 系列(`EmptyHeader` / `EmptyMedia` / …) | 空状态 |
| `Field` 系列(`FieldGroup` / `FieldLabel` / `FieldSet` …) | 表单字段布局,**所有 form 的标准容器** |
| `Form` 系列(`FormField` / `FormItem` / `FormControl` / `FormMessage` …) | react-hook-form 集成 |
| `HoverCard` 系列 | 悬停信息卡 |
| `Icon` | `<Icon name="LayoutDashboard" />` —— 字符串到 lucide 组件的查表渲染(供 RSC ↔ Client 边界用) |
| `Input` | 单行文本输入 |
| `InputGroup` / `InputGroupInput` / `InputGroupAddon` 等 | 输入框 + 前缀 / 后缀 / 按钮组合 |
| `InputOTP` 系列 | OTP / 验证码 |
| `Item` 系列(`ItemGroup` / `ItemMedia` / `ItemContent` / `ItemActions` …) | 非表格列表 UI(列表项 + 头像 + 操作) |
| `Kbd` / `KbdGroup` | 键盘快捷键(如显示 `⌘K`) |
| `Label` | 表单 label(`<FormLabel>` 内部用) |
| `Menubar` 系列 | 桌面应用风格菜单栏 |
| `NativeSelect` | 原生 HTML `<select>`,无 JS 也能用 |
| `NavigationMenu` 系列 | 顶部导航菜单 |
| `Pagination` 系列 | 分页 |
| `Popover` 系列 | 浮动定位面板 |
| `Progress` | 进度条 |
| `RadioGroup` / `RadioGroupItem` | 单选 |
| `Resizable` 系列(react-resizable-panels) | 可拖拽分隔的面板 |
| `ScrollArea` / `ScrollBar` | 自定义滚动条 |
| `Select` 系列 | 自定义下拉 |
| `Separator` | 分隔线 —— **替代** `<hr>` / `border-t` div |
| `Sheet` 系列 | 侧滑面板 |
| `Sidebar` 系列(底层原语) | shadcn 原生侧边栏 —— **不要直接用**,用 atoms 的 `<Sidebar>` |
| `Skeleton` | 加载占位 —— **替代** `animate-pulse` div |
| `Slider` | 范围 / 数值滑块 |
| `Toaster` | sonner 容器(根 layout 已挂) |
| `Spinner` | 加载转圈 |
| `Switch` | 布尔切换(更适合设置页) |
| `Table` 系列 | 表格 |
| `Tabs` 系列 | 标签页 |
| `Textarea` | 多行文本输入 |
| `Toggle` | 切换按钮 |
| `ToggleGroup` / `ToggleGroupItem` | 2-7 选项切换 |
| `Tooltip` 系列 | 悬停提示 |
| **工具函数** | `cn(...)` —— `clsx + tailwind-merge` 合并 className |
| **hook** | `useIsMobile()` —— 视口 < md 检测 |

> shadcn 没有单独的 `Combobox` —— 用 `Popover` + `Command` 组合,见 [`forms.md`](./forms.md) "可搜索下拉"段。

### atoms 完整导出清单(`@openconsole/atoms` latest)

| 导出 | 类型 | 用途 |
| --- | --- | --- |
| `Header` | 组件 | 粘性顶部栏,默认含面包屑 + `ThemeSwitch` + `Preferences` 触发 |
| `Sidebar` | 组件 | 三段式侧边栏(brand / menu / account) |
| `Breadcrumbs` | 组件 | 路径派生面包屑 |
| `Preferences` | 组件 | 设置抽屉(Theme / Layout / Font 标签页) |
| `ColorPicker` | 组件 | CSS 变量绑定颜色输入 |
| `ThemeSwitch` | 组件 | View Transitions 圆形展开的主题切换按钮 |
| `Unauthorized` / `Forbidden` / `NotFound` / `ServerError` / `Maintenance` | 5 个错误页组件 | 用于 `app/{unauthorized,forbidden,not-found,error,global-error}.tsx` |
| `ThemeProvider` | Provider | 包装 `next-themes`(根 layout) |
| `FontProvider` | Provider | 字体偏好(localStorage 持久化) |
| `LayoutProvider` | **Server Provider** | 侧边栏 variant / collapsible / side(cookie 持久化 + 服务端读 + 首屏防闪烁) |
| `SidebarProvider` | **Server Provider** | 侧边栏展开 / 收起(cookie 持久化 + 服务端读 + 首屏防闪烁) |
| `useBreadcrumbs` | hook | headless 面包屑数据 |
| `useLayout` | hook | 读 / 写 `LayoutProvider` 配置 |
| `useFont` | hook | 读 / 写 `FontProvider` 当前字体 |

> ⚠️ `LayoutProvider` / `SidebarProvider` 必须从 `@openconsole/atoms` 引入,**不要**从 `@openconsole/shadcn` —— shadcn 原版的 `SidebarProvider` 只在客户端写 cookie,服务端没有读取,首屏会出现「先展开再收起」的闪烁。

---

## 黑名单(永远禁止)

### ❌ 不要装 shadcn-ui

```bash
pnpm add shadcn-ui          # ❌ 直接装这个包
npx shadcn add button        # ❌ CLI 拷贝源码到本地
npx shadcn-ui@latest init    # ❌ 同上
```

为什么:模板已经通过 `@openconsole/shadcn` 集中管理 shadcn 组件。本地再拷一份会:
- 升级时本地版本和 atoms 依赖不一致
- 主题 token 与 `@openconsole/shadcn/styles.css` 冲突
- 多个应用维护多份代码

### ❌ 不要直接 import Radix

```ts
import * as Dialog from "@radix-ui/react-dialog";  // ❌
import { Slot } from "@radix-ui/react-slot";       // ❌
```

shadcn 已经把 Radix 封了一层,**只**通过 `@openconsole/shadcn` 用 Radix:

```ts
import { Dialog, DialogTrigger, DialogContent } from "@openconsole/shadcn";  // ✅
```

例外:`radix-ui`(总包)是 `@openconsole/shadcn` 的 peer dep,出现在 `package.json` 是正常的。你**不应该**直接从它 import,只是让 shadcn 能解析依赖。

### ❌ 不要拷 shadcn 源码到 `components/ui/`

```
components/ui/button.tsx       # ❌ 整个目录都不允许存在
components/ui/dialog.tsx
```

模板根本就没有 `components/` 目录。所有 UI 都从 `@openconsole/*` 来。

### ❌ 不要装其它 UI 库

```ts
// ❌ 全部禁止
import { Button } from "@mui/material";
import { Button } from "antd";
import { Button } from "@chakra-ui/react";
import { Button } from "@mantine/core";
import { Button } from "react-bootstrap";
import { Button } from "@nextui-org/react";
```

### ❌ 不要装其它图标库

```ts
// ❌
import { FaArrow } from "react-icons/fa";
import { Icon } from "@iconify/react";
import { Heroicon } from "@heroicons/react/24/outline";
```

Lucide 已经有 1000+ 图标。真的没有的图标:用 SVG 直接画(`<svg>` 作为组件)或贡献给 lucide。

### ❌ 不要自己写 cn 工具

```ts
// ❌ 自己拼
function cn(...classes) { return classes.filter(Boolean).join(" "); }

// ✅ 用 shadcn 的(基于 clsx + tailwind-merge,处理 Tailwind 冲突)
import { cn } from "@openconsole/shadcn";
```

---

## 没有现成原语怎么办?

### 决策树

```
新组件需求
├─ atoms 已经覆盖类似业务场景?(Header / Sidebar / Preferences / 错误页 / ColorPicker)
│   └─ ✅ 用 atoms,通过 props 定制
│
├─ shadcn 提供能拼装的低层原语?
│   └─ ✅ 拼装,放到 features/<domain>/components/ 或(真跨项目)提 PR 加到 atoms
│
└─ 都不行(全新基础原语,如全新的图表类型)
    └─ 走 ui skill 流程,加到 @openconsole/shadcn 或 @openconsole/atoms
```

### 示例 1:加一个「带头像的用户卡片」

❌ 不要建 `components/UserCard.tsx`

✅ 拼装方案:

```tsx
// features/users/components/user-card.tsx
"use client";

import { Avatar, AvatarImage, AvatarFallback, Card, CardContent } from "@openconsole/shadcn";
import { Icon } from "@openconsole/shadcn";

export function UserCard({ user, icon }: { user: User; icon?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={user.headUrl ?? undefined} alt={user.realName} />
          <AvatarFallback>{user.realName[0]}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{user.realName}</p>
          <p className="text-muted-foreground text-sm">{user.email}</p>
        </div>
        {icon && <Icon name={icon} className="ml-auto size-4" />}
      </CardContent>
    </Card>
  );
}
```

### 示例 2:三个项目都用「价格输入框」

→ 走 [`ui`](../SKILL.md) skill,加到 `@openconsole/atoms` 或者 `@openconsole/shadcn`:

1. 在 `packages/atoms/components/price-input.tsx` 实现
2. `packages/atoms/index.ts` re-export
3. 升 `@openconsole/atoms` 版本
4. 各项目升级依赖

---

## 主题与样式约束

### 用 Tailwind class 不要 inline style

```tsx
// ❌ inline style 写颜色字面量
<div style={{ color: "#17b3a3" }}>...</div>

// ✅ 用 Tailwind 的 semantic token
<div className="text-primary">...</div>

// ✅ 或 CSS 变量
<div style={{ color: "var(--primary)" }}>...</div>
```

### 用 semantic token 不要 hex

```tsx
// ❌ 散落 hex
<Button className="bg-[#17b3a3]">Save</Button>

// ✅ semantic
<Button>Save</Button>                          // 自动 bg-primary
<Button variant="destructive">Delete</Button>  // 自动 bg-destructive
<div className="text-muted-foreground">提示</div>
```

### 用 `cn()` 合并 class

```tsx
import { cn } from "@openconsole/shadcn";

<Button className={cn("size-9", active && "ring-2 ring-primary", className)} />
```

`twMerge` 自动消除 Tailwind 冲突,后写的优先。详见 [`theme.md`](./theme.md)。

---

## 图标用法

### Lucide 导入

```tsx
// 组件代码里:直接 import 真组件
import { LayoutDashboard, Settings } from "lucide-react";

<LayoutDashboard className="size-4" />
```

### 配置数据中:用字符串(PascalCase)

```ts
// config/sidebar.ts —— 数据要被 RSC 传给 client,函数不可序列化
{
  label: "Dashboard",
  icon: "LayoutDashboard",   // ✅ 字符串
  // icon: LayoutDashboard,   // ❌ 函数引用,RSC → Client 失败
}
```

`@openconsole/shadcn` 提供的 `<Icon name="LayoutDashboard">` 会在 client 端 lookup `lucide-react.icons` 表渲染。

---

## Form 组件白名单

模板里 form 一律走 `react-hook-form + zod + @openconsole/shadcn` 的 `<Form>`:

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
  Input, Textarea, Button,
} from "@openconsole/shadcn";

import { NoteInput } from "../schemas";

const form = useForm<NoteInput>({
  resolver: zodResolver(NoteInput),
  defaultValues: { title: "", content: "" },
});

<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField
      control={form.control}
      name="title"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Title</FormLabel>
          <FormControl><Input {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </form>
</Form>
```

**禁止**:Formik / Final Form / 原生 `<form>` 不带 zod 校验。

---

## Toast

```tsx
import { toast } from "sonner";

toast.success("Saved");
toast.error("Failed");
toast.message("Created", { description: "Note #1 created" });
```

`<Toaster />` 已在 `app/layout.tsx` 挂好,**不要**重复挂。

---

## Tables / Lists

中等到复杂的表格:`@openconsole/shadcn` 的 `<Table>` 系列 + `@tanstack/react-table`(已在依赖里)。

简单展示:直接 `<Table>`。

筛选 / 分页 / 排序 / search:状态走 nuqs(URL 持久化),不要 `useState`。

---

## 抽屉 / 对话框 / 浮层

| 场景 | 用 |
| --- | --- |
| 模态确认 / 表单 | `<Dialog>` |
| 销毁性操作(删除前确认) | `<AlertDialog>` |
| 移动端友好的底部弹出 | `<Drawer>` (vaul) |
| 侧滑设置面板 | `<Sheet>` |
| 悬停信息 | `<HoverCard>` / `<Tooltip>` |
| 下拉菜单 | `<DropdownMenu>` |
| 右键菜单 | `<ContextMenu>` |
| 搜索面板 | `<Command>` (cmdk) |

每种**只**通过 `@openconsole/shadcn` 导入。

---

## Checklist —— review 时过这一遍

- [ ] 没有从 `@radix-ui/*` / `shadcn-ui` / `react-icons` / `antd` / `@mui/*` / `@chakra-ui/*` 等直接 import
- [ ] 没有 `components/ui/` 目录
- [ ] 没有 hex 颜色字面量(`#xxxxxx`)散落在 className 里(用 semantic token)
- [ ] 没有自己写的 `cn` 函数(用 `@openconsole/shadcn` 的)
- [ ] 图标在配置数据里用字符串(`icon: "LayoutDashboard"`),组件代码里直接 import
- [ ] form 用 `react-hook-form` + `zod` + `@openconsole/shadcn` 的 `<Form>`
- [ ] 错误页用 atoms 的 `<NotFound/Unauthorized/Forbidden/ServerError/Maintenance>`
- [ ] 顶栏用 atoms 的 `<Header>`,侧边栏用 `<Sidebar>`,不要自己拼

---

## FAQ

**Q:我从 v0.dev / shadcn UI Cookbook 复制了一段示例,里面写着 `import { Button } from "@/components/ui/button"`,怎么改?**
A:全部改成 `import { Button } from "@openconsole/shadcn"`。删掉 `components/ui/` 的代码(如果你已经拷贝了)。

**Q:我需要一个 `@openconsole/atoms` / `@openconsole/shadcn` 都没有的组件(比如时间轴 timeline),怎么办?**
A:先看能不能用现有原语拼:
- 用 `<Card>` + `<Separator>` + flex 布局 = 简单 timeline
- 实在拼不出来 → 在 `features/<domain>/components/timeline.tsx` 自己写,标 `"use client"`
- 跨项目要用 → 提 PR 加到 `@openconsole/atoms`

**Q:Tailwind v4 没有 `theme()` 函数吗?**
A:有,但模板里基本不用。Tailwind v4 的 `@theme inline { … }` 已经把 token 暴露成 CSS 变量,在 className 里直接用 `bg-primary` / `text-muted-foreground` / `border-border` 就够了。

**Q:可以装 `framer-motion` 做动画吗?**
A:Tailwind v4 + `tw-animate-css`(已装)+ CSS transition 能覆盖 95% 场景。真复杂的(物理 spring、layout animation)开 PR 讨论再加。

**Q:Recharts 怎么样?**
A:`recharts` 已经在依赖里(`3.8.1`)。`@openconsole/shadcn` 提供 `<Chart>` / `<ChartContainer>` 等 Recharts 主题集成。直接用,不要再装别的图表库。
