# @openconsole/atoms

> Next.js 16 业务级组合组件 —— 基于 `@openconsole/shadcn` 拼装的可直接落地的页面骨架与 Provider。

`@openconsole/atoms` 不是另一套 UI 基础库，而是把 shadcn 原语组装成「能直接做后台」的高一层模块：

- **页面骨架**：`<Header>` + `<Sidebar>`，自动响应布局变更（左右切换、折叠模式、变体）。
- **导航**：`<Breadcrumbs>` 自动从 `usePathname()` 派生，可按路径覆盖文本。
- **错误页**：`<Unauthorized>` / `<Forbidden>` / `<NotFound>` / `<ServerError>` / `<Maintenance>` 一行接入。
- **偏好设置**：`<Preferences>` 抽屉提供主题预设选择、按 token 编辑、圆角调节、明暗切换、布局调整。
- **Provider 三件套**：`<ThemeProvider>`（next-themes）+ `<FontProvider>`（字体持久化）+ `<LayoutProvider>`（侧边栏配置）。
- **主题切换动画**：`<ThemeSwitch>` 通过 View Transitions API 从鼠标点击位置做圆形 reveal 动画。

## 安装

```bash
pnpm add @openconsole/atoms @openconsole/shadcn
```

monorepo 内部包消费时，在 `next.config.ts` 中加入 `transpilePackages`：

```ts
const nextConfig = {
  transpilePackages: ["@openconsole/atoms", "@openconsole/shadcn"],
};
```

引入样式：

```ts
// app/layout.tsx
import "@openconsole/shadcn/styles.css";
import "@openconsole/atoms/styles.css";
```

## 快速上手

### 顶层 Provider 三件套

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
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <FontProvider>
            <LayoutProvider>
              <SidebarProvider>{children}</SidebarProvider>
            </LayoutProvider>
          </FontProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### Dashboard 骨架

```tsx
// app/(dashboard)/layout.tsx
import { Header, Sidebar } from "@openconsole/atoms";
import { SidebarInset } from "@openconsole/shadcn";

const menu = [
  {
    label: "主菜单",
    items: [
      { label: "概览", icon: "LayoutDashboard", href: "/dashboard" },
      {
        label: "订单",
        icon: "ShoppingCart",
        children: [
          { label: "全部订单", href: "/dashboard/orders" },
          { label: "退款", href: "/dashboard/orders/refunds" },
        ],
      },
    ],
  },
];

const account = {
  name: "张三",
  email: "san.zhang@example.com",
  menu: [
    { label: "个人资料", icon: "User", href: "/profile" },
    { label: "账单", icon: "CreditCard", href: "/billing" },
    { separator: true, label: "登出", icon: "LogOut", destructive: true,
      onSelect: () => signOut() },
  ],
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar
        brand={{ name: "OpenConsole", logo: "Command", description: "Pro" }}
        menu={menu}
        account={account}
      />
      <SidebarInset>
        <Header />
        {children}
      </SidebarInset>
    </>
  );
}
```

## 组件参考

### 页面骨架

#### `<Header>`

粘性顶栏。左右两段：导航段（面包屑 + 折叠时的展开按钮）跟随侧边栏所在的一侧；工具段（自定义 actions + 内置 `ThemeSwitch` + 设置按钮）在另一侧。

```tsx
<Header />                              // 默认：自动 Breadcrumbs + 默认 actions
<Header breadcrumbs={false} />          // 隐藏面包屑
<Header breadcrumbs="编辑订单 #123" />   // 自定义节点
<Header actions={<NotificationBell />} hideDefaultActions />
```

#### `<Sidebar>`

三段式侧边栏（brand / menu / account），自动从 {@link LayoutProvider} 读取变体配置。

```tsx
<Sidebar
  brand={{ name: "...", logo: "Command", description: "Pro" }}
  menu={[
    { label: "主菜单", items: [...] },
    { label: "管理",  items: [...] },
  ]}
  account={{ name: "...", email: "...", avatar?: "...", menu?: [...] }}
/>
```

菜单项支持一层嵌套：展开状态下用可折叠子菜单，折叠（icon-only）状态下用右侧弹出 flyout。激活态自动跟随当前 pathname。

### 导航

#### `<Breadcrumbs>` + `useBreadcrumbs()`

```tsx
<Breadcrumbs labels={{ "/dashboard/orders/123": "订单 #123" }} />
<Breadcrumbs items={[{ title: "向导", link: "/wizard" }, { title: "第 2 步", link: "/wizard/2" }]} />
```

要无头渲染：

```tsx
const crumbs = useBreadcrumbs({
  labels: { "/dashboard": "概览" },
  transform: (seg) => seg.toUpperCase(),
});
```

### 错误页

```tsx
// app/not-found.tsx
import { NotFound } from "@openconsole/atoms";
export default NotFound;

// app/(auth)/forbidden/page.tsx
import { Forbidden } from "@openconsole/atoms";
export default function Page() {
  return <Forbidden title="无权访问" description="请联系管理员申请权限。" />;
}
```

可选定制：`status` / `title` / `description` / `icon` / `actions` / `className`。

5 个组件对应规范 HTTP 状态码：

| 组件             | 状态码 | 用途                       |
| ---------------- | ------ | -------------------------- |
| `<Unauthorized>` | 401    | 未登录                     |
| `<Forbidden>`    | 403    | 已登录但无权限             |
| `<NotFound>`     | 404    | 页面不存在或已迁移         |
| `<ServerError>`  | 500    | 通用 5xx                   |
| `<Maintenance>`  | 503    | 维护中                     |

### 偏好设置

#### `<Preferences>`

抽屉式设置面板，从侧边栏对侧滑入。两个 tab：

- **Theme**：shadcn / tweakcn 预设下拉 + `Random` 随机、圆角档位、明暗切换、Import CSS 主题、按 token 编辑品牌色。
- **Layout**：`variant`（sidebar / floating / inset）、折叠模式、摆放位置。

`<Header>` 默认会渲染设置按钮并打开本抽屉。

#### `<ThemeSwitch>`

零参数按钮。点击触发 View Transitions API 圆形 reveal，从鼠标点击坐标动画扩散切换明暗主题。

### 工具组件

#### `<ColorPicker>`

带原生取色器的色块 + 文本输入双行编辑器。`Preferences` 中按 token 编辑品牌色用的就是它，业务上也可独立使用。

```tsx
<ColorPicker
  label="主色"
  cssVar="--primary"
  value={current}
  onChange={(cssVar, value) => apply(cssVar, value)}
/>
```

## Provider 与 Hook

### `<ThemeProvider>`

`next-themes` 的薄包装，预置 `attribute="class"` / `defaultTheme="system"` / 启用系统主题 / 切换时关闭全局过渡。任意 prop 都可覆盖。

### `<FontProvider>` + `useFont()`

```tsx
<FontProvider
  options={["inter", "manrope", "system"]}  // 默认
  defaultFont="inter"
  storage="openconsole-font"                 // localStorage 键；null 关闭持久化
  classPrefix="font-"                        // 应用为 `<html class="font-inter">`
>
  {children}
</FontProvider>

const { font, setFont, options } = useFont();
```

### `<LayoutProvider>` + `useLayout()`

```tsx
<LayoutProvider defaultConfig={{ variant: "inset", collapsible: "icon", side: "left" }}>
  ...
</LayoutProvider>

const { config, updateConfig } = useLayout();
updateConfig({ side: "right" }); // 部分合并
```

字段定义：

```ts
interface LayoutConfig {
  variant: "sidebar" | "floating" | "inset";
  collapsible: "offcanvas" | "icon" | "none";
  side: "left" | "right";
}
```

### `useBreadcrumbs(options?)`

返回 `Crumb[]`。无头版本，`<Breadcrumbs>` 之外可自行渲染。

## 数据约定

### `MenuItem` / `MenuGroup`

```ts
interface MenuGroup {
  label?: string;        // 分组标题，省略即匿名分组
  items: MenuItem[];
}

interface MenuItem {
  label: string;
  icon?: string;         // lucide-react 图标名，PascalCase
  href?: LinkProps["href"];
  children?: MenuItem[]; // 只渲染一层，更深层级会被忽略
  badge?: string;
  badgeColor?: "violet" | "green";
}
```

### `User` / `AccountMenuItem`

```ts
interface User {
  name: string;
  email: string;
  avatar?: string;       // 缺失时回退到姓名首字母
  menu?: AccountMenuItem[]; // 非空时账号卡片变成下拉触发器
}

interface AccountMenuItem {
  label: string;
  icon?: string;
  href?: LinkProps["href"];
  onSelect?: () => void;
  separator?: boolean;    // 本项前画一条分割线
  destructive?: boolean;  // 红色样式
}
```

### `Brand`

```ts
interface Brand {
  name: string;
  logo: string;          // lucide-react 图标名
  description?: string;
}
```

## 常见问题

**Q：`useFont must be used within a FontProvider` / `useLayout must be used within a LayoutProvider`？**
A：保证 Provider 三件套挂在 `<RootLayout>` 顶层，并且消费者一定是它的后代。

**Q：菜单项怎么自动选中当前路由？**
A：内部读取 `usePathname()`，叶子项 `href` 与 pathname 完全相等即视为激活；带 `children` 的父项里任一子项 `href` 匹配也算激活，路由切换时自动展开匹配分支。

**Q：怎么自定义面包屑某一节点的文本？**
A：`<Breadcrumbs labels={{ "/dashboard/orders/abc-uuid": "订单详情" }} />` 按路径精确覆盖；其它仍走 segment 转换函数。

**Q：错误页里的 "Go back" / "Go home" 按钮文案是英文，能否中文化？**
A：传入自定义 `actions` 节点完整接管按钮区即可：

```tsx
<NotFound
  actions={
    <>
      <Button variant="outline" onClick={() => router.back()}>返回</Button>
      <Button asChild><Link href="/">回到首页</Link></Button>
    </>
  }
/>
```

**Q：`<ThemeSwitch>` 的圆形 reveal 动画从哪里开始？**
A：从触发点击事件的 `event.clientX/Y` 开始，记录到 CSS 变量 `--vt-origin-x/y`，再由 `circular-transition.css` 中的 View Transitions 规则消费。

## License

参见仓库根目录的 LICENSE。
