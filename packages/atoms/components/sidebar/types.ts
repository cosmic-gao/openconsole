import type { LinkProps } from "next/link";

/**
 * 侧边栏顶部品牌区 —— logo + 名称。
 */
export interface Brand {
  /** 品牌名；不单独渲染文字，仅用作图片 logo 的 `alt`。 */
  name: string;
  /**
   * 品牌标识，两种形态：
   *
   * - **字符串**：交给 {@link Icon} 自动判别（lucide 图标名 PascalCase /
   *   内联 SVG 源码 / 图片地址）。渲染在方形品牌框内，明暗与展开/折叠共用
   *   同一个 —— 适合方形图标 mark（例如 `"Command"`）。
   * - **{@link BrandLogo} 对象**：按主题与折叠态切换的图片 logo，适合「宽
   *   wordmark + 方形 favicon」的组合。展开时显示 `light` / `dark`（不套
   *   品牌框，按原始比例展示），折叠到图标宽度时显示 `collapsed`。全部走
   *   纯 CSS 切换（`dark:` 与 `group-data-[collapsible=icon]:`），不依赖
   *   运行时主题 hook，无水合闪烁。
   */
  logo: string | BrandLogo;
}

/**
 * 按主题 / 折叠态切换的品牌 logo。每个字段都是一个 logo 源（lucide 图标名 /
 * 内联 SVG / 图片地址），交给 {@link Icon} 渲染；缺省字段按 light 方向回退。
 */
export interface BrandLogo {
  /** 展开态 logo（亮色主题）。通常是宽 wordmark 图片。 */
  light: string;
  /** 展开态 logo（暗色主题）。缺省回退到 {@link BrandLogo.light}。 */
  dark?: string;
  /** 折叠到图标宽度时的方形 mark（例如 favicon）。缺省回退到展开态 logo。 */
  collapsed?: string;
  /**
   * 折叠态 mark（暗色主题）。缺省回退到 {@link BrandLogo.collapsed} →
   * {@link BrandLogo.dark}。
   */
  collapsedDark?: string;
}

/**
 * 出现在账号下拉菜单中的一项操作（个人资料、账单、登出……）。
 *
 * `href`（渲染为 `<Link>`）和 `onSelect`（渲染为按钮）二选一。
 * `separator: true` 会在本项之**前**画一条分割线 —— 用于视觉分组
 * （例如把账号操作和登出按钮区分开）。
 */
export interface AccountMenuItem {
  /** 显示文本。 */
  label: string;
  /** `lucide-react` 图标名，例如 `"Settings"`。 */
  icon?: string;
  /** 链接地址；与 `onSelect` 互斥。 */
  href?: LinkProps["href"];
  /** 点击回调；与 `href` 互斥。 */
  onSelect?: () => void;
  /** 是否在本项之前画一条 `DropdownMenuSeparator`。 */
  separator?: boolean;
  /** 是否使用 destructive（红色）样式 —— 常用于 "Sign out" / "Delete"。 */
  destructive?: boolean;
}

/**
 * 侧边栏底部账号卡片。
 *
 * 不传 `menu`：渲染为静态卡片。
 * 传了 `menu`：卡片变成下拉触发器。
 */
export interface User {
  /** 用户名（同时用于生成 fallback 头像缩写）。 */
  name: string;
  /** 邮箱（卡片副标题）。 */
  email: string;
  /** 头像图片 URL；缺失时回退到姓名首字母。 */
  avatar?: string;
  /** 非空时账号块变成下拉触发器，每项渲染为一行菜单。 */
  menu?: AccountMenuItem[];
}

/**
 * 递归菜单项。`href` 表示叶子链接；`children` 表示父级分组。
 * 有 `children` 没 `href` 的项作为可折叠分组渲染。
 */
export interface MenuItem {
  /** 显示文本。 */
  label: string;
  /** `lucide-react` 图标名，例如 `"LayoutDashboard"`。 */
  icon?: string;
  /** 路由地址；父级项可省略。 */
  href?: LinkProps["href"];
  /** 嵌套子项；只渲染一层，更深层级会被忽略。 */
  children?: MenuItem[];
  /** 渲染在 label 后的小徽章。 */
  badge?: string;
  /** 徽章配色，仅支持 `violet`（默认）与 `green`。 */
  badgeColor?: "violet" | "green";
}

/**
 * 带标题的菜单分组。省略 `label` 即匿名分组。
 */
export interface MenuGroup {
  label?: string;
  items: MenuItem[];
}
