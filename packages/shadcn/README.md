# @openconsole/shadcn

> 整套 [shadcn/ui](https://ui.shadcn.com) 原语 + 设计 token，按包发布，配套 Tailwind v4 主题与 OKLCH 配色。

`@openconsole/shadcn` 把 shadcn 官方组件直接落进 monorepo 作为可发布的内部包，相比 CLI 拷贝到每个应用的做法：

- 升级集中：所有应用共用同一份组件实现。
- **平铺命名空间**：所有组件都从 `@openconsole/shadcn` 一行导入，不需要按文件路径区分。
- **样式开箱即用**：`@openconsole/shadcn/styles.css` 自带 Tailwind v4 `@theme` 配置与默认明暗变量。
- **附赠**：`cn()` 工具、`<Icon>` 字符串图标渲染、`useIsMobile()`、`<DirectionProvider>`。
- 上层包 `@openconsole/atoms` 在这一层之上做更高层次的组合（Header / Sidebar / Preferences）。

## 安装

```bash
pnpm add @openconsole/shadcn
```

monorepo 内部包消费时需要在 `next.config.ts` 加入 `transpilePackages`，否则 Next.js 不会解析 `.tsx` 源码：

```ts
const nextConfig = {
  transpilePackages: ["@openconsole/shadcn"],
};
```

引入样式（**在所有应用样式之前**）：

```ts
// app/layout.tsx
import "@openconsole/shadcn/styles.css";
```

确保你的 Tailwind 配置/PostCSS 链路工作（Tailwind v4 是 zero-config，绝大多数情况下只要 import 样式即可）。

> **Peer 依赖**：见 [`package.json`](./package.json) `peerDependencies` 字段。Radix UI、`lucide-react`、`class-variance-authority`、`clsx`、`tailwind-merge`、`tailwindcss@^4` 等都必须由应用层提供。

## 用法

```tsx
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from "@openconsole/shadcn";

export default function Demo() {
  return (
    <Card>
      <CardHeader><CardTitle>登录</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Input placeholder="邮箱" />
        <Button className="w-full">提交</Button>
      </CardContent>
    </Card>
  );
}
```

所有组件都是平铺导出 —— **不要**深路径 import：

```ts
// ✅
import { Button } from "@openconsole/shadcn";

// ❌
import { Button } from "@openconsole/shadcn/button";
```

## 组件总览

按 shadcn 的语义分类组织。每个组件在 [shadcn/ui 官网](https://ui.shadcn.com/docs/components) 都能找到详尽文档；本包是它的镜像版本，**API 与 props 与官方一致**。

### 布局 & 容器

| 组件                                           | 用途                            |
| ---------------------------------------------- | ------------------------------- |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction` | 卡片容器                        |
| `Separator`                                    | 水平/垂直分割线                 |
| `AspectRatio`                                  | 固定宽高比容器                  |
| `ScrollArea`, `ScrollBar`                      | 自定义滚动条                    |
| `Resizable`, `ResizablePanel`, `ResizableHandle`, `ResizablePanelGroup` | 可拖拽分屏                      |
| `Sidebar`, `SidebarProvider`, `SidebarInset`, `SidebarTrigger`, `SidebarRail`, `SidebarHeader`, `SidebarFooter`, `SidebarContent`, `SidebarGroup`, `SidebarMenu`, … + `useSidebar` | 完整侧边栏体系                  |

### 按钮 & 行动元素

| 组件                                       | 用途                                   |
| ------------------------------------------ | -------------------------------------- |
| `Button` + `buttonVariants`                | 主按钮组件 + cva 变体                  |
| `ButtonGroup`                              | 按钮组合                               |
| `Toggle`, `toggleVariants`                 | 单击切换按钮                           |
| `ToggleGroup`, `ToggleGroupItem`           | 多选/单选切换按钮组                    |

### 表单输入

| 组件                                                                              | 用途                          |
| --------------------------------------------------------------------------------- | ----------------------------- |
| `Input`                                                                           | 文本输入                      |
| `Textarea`                                                                        | 多行文本输入                  |
| `Label`                                                                           | 表单标签                      |
| `Checkbox`                                                                        | 复选框                        |
| `RadioGroup`, `RadioGroupItem`                                                    | 单选框组                      |
| `Switch`                                                                          | 开关                          |
| `Slider`                                                                          | 拖动条                        |
| `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, ...      | Radix Select                  |
| `NativeSelect`, `NativeSelectContent`, ...                                         | 原生 `<select>` 包装         |
| `InputOTP`, `InputOTPGroup`, `InputOTPSlot`, `InputOTPSeparator`                  | OTP 验证码输入                |
| `Field`, `FieldLabel`, `FieldDescription`, `FieldError`, ...                       | 表单字段包装                 |
| `InputGroup`, `InputGroupInput`, `InputGroupAddon`, ...                            | 输入组（带前后缀）            |
| `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField` | react-hook-form 集成          |

### 反馈

| 组件                                                                                 | 用途                  |
| ------------------------------------------------------------------------------------ | --------------------- |
| `Alert`, `AlertTitle`, `AlertDescription`                                            | 静态提示横幅          |
| `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogAction`, ...   | 确认对话框            |
| `Toaster`                                                                             | sonner Toast 容器     |
| `Progress`                                                                            | 进度条                |
| `Spinner`                                                                             | 加载圈                |
| `Skeleton`                                                                            | 骨架屏占位            |
| `Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`, ...         | 空状态                |

### 浮层 & 弹窗

| 组件                                                                              | 用途              |
| --------------------------------------------------------------------------------- | ----------------- |
| `Dialog`, `DialogTrigger`, `DialogContent`, ...                                    | 模态对话框        |
| `Drawer`, `DrawerTrigger`, `DrawerContent`, ...                                    | vaul 抽屉         |
| `Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetTitle`, ...         | 侧滑抽屉          |
| `Popover`, `PopoverTrigger`, `PopoverContent`                                      | 气泡卡片          |
| `HoverCard`, `HoverCardTrigger`, `HoverCardContent`                                | 悬停卡片          |
| `Tooltip`, `TooltipProvider`, `TooltipTrigger`, `TooltipContent`                   | 工具提示          |

### 菜单

| 组件                                                                                                                          | 用途                |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, ... | 下拉菜单            |
| `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, ...                                                                          | 右键菜单            |
| `Menubar`, `MenubarMenu`, `MenubarTrigger`, `MenubarContent`, `MenubarItem`, ...                                                                            | 桌面应用风格菜单栏  |
| `NavigationMenu`, `NavigationMenuList`, `NavigationMenuItem`, `NavigationMenuTrigger`, `NavigationMenuContent`, ...                                         | 多级导航菜单        |
| `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandGroup`, `CommandItem`, `CommandShortcut`, ...                                            | cmdk 命令面板       |

### 数据展示

| 组件                                                                              | 用途                  |
| --------------------------------------------------------------------------------- | --------------------- |
| `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption` | 表格                  |
| `Pagination`, `PaginationContent`, `PaginationItem`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `PaginationEllipsis` | 分页器                |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`                                  | 标签页                |
| `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`              | 手风琴                |
| `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`                         | 折叠面板              |
| `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext`, `useCarousel` | embla 轮播            |
| `Chart`, `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, ...| recharts 主题集成     |
| `Item`, `ItemGroup`, `ItemHeader`, `ItemTitle`, `ItemDescription`, `ItemContent`, ...| 通用列表项卡片        |

### 工具元素

| 组件                                                       | 用途                            |
| ---------------------------------------------------------- | ------------------------------- |
| `Avatar`, `AvatarImage`, `AvatarFallback`                  | 头像                            |
| `Badge`                                                    | 徽章                            |
| `Kbd`, `KbdGroup`                                          | 键盘按键文本                    |
| `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`, `BreadcrumbEllipsis` | 面包屑                          |
| `Calendar`, `CalendarDayButton`                            | react-day-picker 日历           |

### 工具与公共导出

| 名称                  | 用途                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| `cn(...inputs)`       | `clsx + tailwind-merge`，合并 class 并消除 Tailwind 冲突                          |
| `Icon`                | 按名称字符串渲染 `lucide-react` 图标，便于在 RSC ↔ Client 间传递可序列化数据      |
| `useIsMobile()`       | 监听 `(max-width: 767px)`，返回当前是否为移动端宽度                              |
| `DirectionProvider`, `useDirection` | Radix Direction（LTR / RTL），影响所有 Radix 子项的方向感知                       |

## 示例

### `cn()` 合并 class

```ts
import { cn } from "@openconsole/shadcn";

<button
  className={cn(
    "rounded-md px-3 py-1",
    isPrimary && "bg-primary text-primary-foreground",
    className,                   // 调用方覆盖
  )}
/>
```

`twMerge` 自动消除 Tailwind 冲突（例如 `px-2` 与 `px-4` 写一起会保留后写的）。

### `<Icon>` 字符串图标

Sider / 菜单等数据结构里把图标存成字符串可以让 Server Component 安全传给 Client Component。`<Icon>` 在 client 端查表渲染：

```tsx
import { Icon } from "@openconsole/shadcn";

const menu = [
  { label: "概览", icon: "LayoutDashboard", href: "/dashboard" },
  { label: "订单", icon: "ShoppingCart",    href: "/orders"    },
];

<Icon name={menu[0].icon} className="size-4" />
```

`name` 不存在时返回 `null`，不会抛错。

### `useIsMobile()` 响应式分支

```tsx
import { useIsMobile } from "@openconsole/shadcn";

function Page() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileView /> : <DesktopView />;
}
```

第一次 mount 前返回 `false`（SSR 安全）。

### `<DirectionProvider>` RTL

```tsx
import { DirectionProvider } from "@openconsole/shadcn";

<DirectionProvider direction="rtl">
  {/* 所有 Radix 子项自动按右到左渲染 */}
</DirectionProvider>
```

### `<Sidebar>` 完整骨架

shadcn 的 sidebar 体系自包含。如果你只用到底层原语：

```tsx
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  SidebarInset,
} from "@openconsole/shadcn";

<SidebarProvider>
  <Sidebar>
    <SidebarHeader>{/* 品牌 */}</SidebarHeader>
    <SidebarContent>{/* 菜单 */}</SidebarContent>
    <SidebarFooter>{/* 账号 */}</SidebarFooter>
    <SidebarRail />
  </Sidebar>
  <SidebarInset>
    {children}
  </SidebarInset>
</SidebarProvider>
```

要更高层的封装，请直接使用 `@openconsole/atoms` 的 `<Sidebar>`。

### Form + react-hook-form + zod

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@openconsole/shadcn";

const schema = z.object({ email: z.string().email() });

function SignIn() {
  const form = useForm({ resolver: zodResolver(schema) });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => signIn(v))}>
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
        <Button type="submit">登录</Button>
      </form>
    </Form>
  );
}
```

## 主题与 Token

`@openconsole/shadcn/styles.css` 包含三部分：

1. `@theme inline { … }` —— 把 CSS 变量映射成 Tailwind v4 设计 token（`bg-primary` ↔ `var(--primary)`）。
2. `:root { … }` —— light 模式的默认 OKLCH 配色。
3. `.dark { … }` —— dark 模式的默认 OKLCH 配色。

### 自定义主题

直接覆盖 CSS 变量即可：

```css
:root {
  --primary: oklch(0.6 0.2 250);
  --primary-foreground: oklch(0.98 0 0);
  --radius: 0.5rem;
}
```

或者使用 `@openconsole/atoms` 的 `<Preferences>` 抽屉做运行时实时编辑（包含 shadcn / tweakcn 数百套预设、品牌色按 token 编辑、CSS 粘贴导入）。

### `next-themes` 接入

通常配合 `<ThemeProvider attribute="class">` 切换 `.dark` 类名。直接用本包：

```tsx
import { ThemeProvider } from "next-themes";

<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  {children}
</ThemeProvider>
```

或使用 `@openconsole/atoms` 的 `<ThemeProvider>`（带默认值的薄包装）。

## 与 shadcn/ui CLI 的差异

| 维度       | `@openconsole/shadcn`                | `npx shadcn add`              |
| ---------- | ------------------------------------ | ----------------------------- |
| 分发方式   | 包，集中升级                          | 拷贝到应用，分散维护          |
| 导入方式   | 平铺 `from "@openconsole/shadcn"`     | 按文件路径 `from "@/components/ui/button"` |
| 样式       | `import "@openconsole/shadcn/styles.css"` 一行就位 | 拷贝 `globals.css` 后手工维护 |
| 升级       | 升级包                                | 重新 add + 手工 diff          |
| 跨应用复用 | 一份代码 N 个应用                     | N 份相同代码                  |
| 修改组件   | 改源码即可，monorepo 内立刻生效        | 自由度更高                    |

## 常见问题

**Q：为什么导入路径里没有 `/button` / `/card`？**
A：本包用 `index.ts` 平铺所有导出，强制让所有组件走 `@openconsole/shadcn`。这样升级只改一处 `import`。深路径不受支持，未来重构组件文件结构时不会破坏调用方。

**Q：我能像 shadcn CLI 那样直接改组件源码吗？**
A：能。monorepo 内 `packages/shadcn/<component>.tsx` 是直接源码，按 `transpilePackages` 配置编译到应用。改完立刻看到效果。但请注意改动会影响所有依赖该组件的应用。

**Q：为什么需要传给 `<Icon>` 字符串而不是直接 React 组件？**
A：菜单 / 导航这类数据结构会被 RSC ↔ Client 间传递。React 组件不可序列化，字符串可以。把图标查表延迟到 Client 端做。

**Q：`useIsMobile()` 的断点能改吗？**
A：当前断点是 `768px`，硬编码在 [`hooks/use-mobile.ts`](./hooks/use-mobile.ts)。需要不同断点就直接用 `window.matchMedia` 自己写一个。

**Q：Tailwind v4 配置去哪了？**
A：v4 是 zero-config。本包通过 `styles.css` 里的 `@source "./**/*.{ts,tsx}"` 和 `@theme inline { … }` 完成等价的「配置」。应用层无需再写 `tailwind.config.js`。

## 与 `@openconsole/atoms` 的关系

`@openconsole/atoms` 在本包之上做了更高层的组合：

| 层次                     | 包                       | 关注点                                |
| ------------------------ | ------------------------ | ------------------------------------- |
| 设计 token + 原语        | `@openconsole/shadcn`    | 按钮 / 输入 / 弹窗 / 分页…             |
| 业务级骨架               | `@openconsole/atoms`     | Header / Sidebar / Breadcrumbs / 错误页 / Preferences |

只用得到原语：直接 `@openconsole/shadcn`。要做后台骨架：装 `@openconsole/atoms`（它已经把 shadcn 列为 peer 依赖）。

## License

参见仓库根目录的 LICENSE。
