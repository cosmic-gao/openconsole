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
 * 菜单项「命中（高亮）」策略，用于子页 / 详情页的菜单选中逻辑。默认 `"prefix"`。
 *
 * - `"prefix"`：精确相等，或当前路径落在 `href` 的子路径下 —— 子页 / 详情页
 *   仍点亮父链接（例如 `/agents` 在 `/agents/123/chat` 时高亮）。
 * - `"exact"`：仅精确相等，适合 `/` 这类不希望被子路径连带点亮的项。
 * - `string[]`：在 `href` 之外**追加**的命中前缀 —— 用于详情页 URL 不落在
 *   `href` 之下的场景（例如菜单项 `href="/agents"`，详情页却在 `/chat/:id`，
 *   传 `["/chat"]` 即可让它在详情页保持高亮）。
 * - `(pathname) => boolean`：完全自定义判断，返回 `true` 视为最高优先级命中。
 *
 * 多项同时命中时，只有「最具体」的一项会高亮（命中前缀最长 / 精确 / 自定义
 * 优先），避免父子或相邻前缀项同时点亮 —— 见 `Menu` 的最长前缀匹配。
 */
export type MatchStrategy =
  | "exact"
  | "prefix"
  | string[]
  | ((pathname: string) => boolean);

/**
 * 递归菜单项,有三种形态:
 *
 * - **导航项**:有 `href` → 渲染为 `<Link>`,导航中显示 pending 态。
 * - **动作项**:有 `onSelect` 无 `href` → 渲染为 `<button>`,点击触发回调
 *   (新建、退出、打开命令面板等非路由操作)。`href` 与 `onSelect` 互斥;
 *   同时给时以 `href` 为准。注意 `onSelect` 是函数,**不可**从 Server
 *   Component 序列化下传,动作项需在 Client Component 内定义。
 * - **分组项**:有 `children` → 作为可折叠父级渲染(展开内联子菜单 / 折叠时
 *   弹出 flyout)。父级自身的 `onSelect` 被忽略(点击只切换展开)。
 */
export interface MenuItem {
  /** 显示文本。 */
  label: string;
  /** `lucide-react` 图标名,例如 `"LayoutDashboard"`。 */
  icon?: string;
  /** 路由地址(导航项);父级与动作项可省略。 */
  href?: LinkProps["href"];
  /**
   * 点击回调(动作项),与 `href` 互斥。用于不改变路由的操作,例如
   * 「新建会话」「退出登录」「打开命令面板」。
   */
  onSelect?: () => void;
  /**
   * 命中(高亮)策略,决定子页 / 详情页下本项是否选中。缺省 `"prefix"`。
   * 详见 {@link MatchStrategy}。动作项默认不参与路由命中,需要时可传函数。
   */
  match?: MatchStrategy;
  /** 嵌套子项;只渲染一层,更深层级会被忽略。 */
  children?: MenuItem[];
  /** 渲染在 label 后的小徽章。 */
  badge?: string;
  /** 徽章配色,仅支持 `violet`(默认)与 `green`;搭配 `badge` 使用。 */
  color?: "violet" | "green";
}

/**
 * 带标题的菜单分组。省略 `label` 即匿名分组。
 */
export interface MenuGroup {
  label?: string;
  items: MenuItem[];
}
