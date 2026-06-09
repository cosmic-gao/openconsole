"use client";

import { ChevronRight, LoaderCircle } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import type { ReactElement, ReactNode } from "react";

import {
  Badge,
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@openconsole/shadcn";

import type { MatchStrategy, MenuGroup, MenuItem } from "./types";

/** 类型守卫所需的「父级项」形态：children 至少有一项。 */
type Parent = MenuItem & { children: MenuItem[] };

/** 判断一项是否是父级（带 children）。 */
function isParent(item: MenuItem): item is Parent {
  return Array.isArray(item.children) && item.children.length > 0;
}

/** 自定义函数 / 显式命中的优先级 —— 永远胜过任何基于长度的前缀命中。 */
const EXPLICIT_SCORE = Number.MAX_SAFE_INTEGER;

/**
 * 计算某项相对当前 pathname 的「匹配相关度」：越大越相关，`-1` 表示未命中。
 *
 * 相关度即命中前缀的长度（精确相等取整串长度，子路径前缀取该前缀长度），
 * 因此「最长前缀匹配」天然等价于「相关度最高者胜」。`match` 策略见
 * {@link MatchStrategy}：`exact` 关闭子路径前缀；数组追加额外前缀；函数返回
 * `true` 取最高优先级。根路径 `/` 仅精确命中，避免在所有页面被点亮。
 */
function relevance(pathname: string, item: MenuItem): number {
  const match: MatchStrategy = item.match ?? "prefix";
  if (typeof match === "function") return match(pathname) ? EXPLICIT_SCORE : -1;

  const exactOnly = match === "exact";
  const extra = Array.isArray(match) ? match : [];
  const targets = [item.href, ...extra].filter(
    (h): h is string => typeof h === "string",
  );

  let best = -1;
  for (const target of targets) {
    if (pathname === target) {
      best = Math.max(best, target.length);
    } else if (
      !exactOnly &&
      target !== "/" &&
      pathname.startsWith(`${target}/`)
    ) {
      best = Math.max(best, target.length);
    }
  }
  return best;
}

/**
 * 跨所有分组，挑出当前 pathname 下「最具体」的那一项（叶子或父级自身）。
 *
 * 父级 href 与其子项一同参与竞争（如分组索引页 `/settings` 自身命中）；
 * 相关度相同则先遍历者胜（稳定）。返回的引用用于驱动高亮 —— 全局只点亮一项，
 * 从根本上避免父子 / 相邻前缀项同时高亮。
 */
function pick(groups: MenuGroup[], pathname: string): MenuItem | null {
  let winner: MenuItem | null = null;
  let best = -1;
  const consider = (item: MenuItem) => {
    const score = relevance(pathname, item);
    if (score > best) {
      best = score;
      winner = item;
    }
  };
  for (const group of groups) {
    for (const item of group.items) {
      consider(item);
      item.children?.forEach(consider);
    }
  }
  return winner;
}

/** 当前命中项（最具体）的上下文 —— 由 `Menu` 统一解析后下发。 */
const ActiveContext = React.createContext<MenuItem | null>(null);

/** 读取当前命中项；未命中为 `null`。 */
function useActiveItem(): MenuItem | null {
  return React.useContext(ActiveContext);
}

/**
 * 本项是否高亮：自身即命中项，或（父级）命中项落在其子项中。
 */
function useItemActive(item: MenuItem): boolean {
  const active = useActiveItem();
  if (!active) return false;
  return active === item || (item.children?.includes(active) ?? false);
}

function NavBadge({
  children,
  color = "violet",
}: {
  children: ReactNode;
  color?: "violet" | "green";
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "ml-auto h-5 px-1.5 text-[10px] font-medium",
        color === "green" &&
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        color === "violet" && "bg-primary/15 text-primary",
      )}
    >
      {children}
    </Badge>
  );
}

/** 菜单项主体：前导图标 + 文本 + 徽章。`icon` 省略时回退到 `item.icon` 的静态图标。 */
function ItemContent({ item, icon }: { item: MenuItem; icon?: ReactNode }) {
  return (
    <>
      {icon ?? (item.icon ? <Icon name={item.icon} /> : null)}
      <span>{item.label}</span>
      {item.badge && <NavBadge color={item.color}>{item.badge}</NavBadge>}
    </>
  );
}

/**
 * 链接项的前导图标：导航进行中显示 spinner 取代图标，给出「正在加载」反馈。
 * spinner 延迟 100ms 才淡入（见 `animate-pending`），秒开的导航根本不显示，
 * 避免一闪而过。依赖 `useLinkStatus`，**只能**渲染在 `<Link>` 子树内。
 */
function PendingIcon({ name }: { name?: string }) {
  const { pending } = useLinkStatus();
  if (pending) return <LoaderCircle className="animate-pending" />;
  return name ? <Icon name={name} /> : null;
}

/**
 * 渲染一个叶子 / 子项的可点击本体，作为 shadcn 按钮原语的 `asChild` 子节点：
 *
 * - 有 `href` → `<Link>`（前导图标随导航显示 pending 态）；
 * - 有 `onSelect` → `<button>`（触发动作后一并执行 `onNavigate`）；
 * - 皆无 → 不可点击 `<span>`（罕见的纯标签项）。
 *
 * 返回**真实元素**（非组件），外层 `Slot` 才能正确把样式 / `data-*` / ref
 * 合并到 `<a>` / `<button>` 上。
 */
function renderTarget(item: MenuItem, onNavigate?: () => void): ReactElement {
  if (item.href !== undefined) {
    return (
      <Link href={item.href} onClick={onNavigate}>
        <ItemContent item={item} icon={<PendingIcon name={item.icon} />} />
      </Link>
    );
  }
  if (item.onSelect) {
    const handleSelect = () => {
      item.onSelect?.();
      onNavigate?.();
    };
    return (
      <button type="button" onClick={handleSelect}>
        <ItemContent item={item} />
      </button>
    );
  }
  return (
    <span>
      <ItemContent item={item} />
    </span>
  );
}

/**
 * 渲染分组菜单。每个 group 是一个 `SidebarGroup`，可选 label。
 *
 * 一级项：叶子直接渲染；带 children 的项根据当前是否折叠：
 * 展开状态 → 内联可折叠子菜单（`<Submenu>`）；
 * 折叠（仅图标）状态 → 弹出右侧 flyout（`<Flyout>`）。
 */
export function Menu({ groups }: { groups: MenuGroup[] }) {
  const pathname = usePathname();
  // 命中项跨分组统一解析（最长前缀匹配），再经 context 下发，保证全局只点亮一项。
  const active = React.useMemo(
    () => pick(groups, pathname),
    [groups, pathname],
  );

  return (
    <ActiveContext.Provider value={active}>
      {groups.map((group, i) => (
        <MenuSection key={group.label ?? `group-${i}`} group={group} />
      ))}
    </ActiveContext.Provider>
  );
}

function MenuSection({ group }: { group: MenuGroup }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <SidebarGroup className="py-0">
      {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
      <SidebarMenu>
        {group.items.map((item) => {
          const key = `${item.label}-${
            typeof item.href === "string" ? item.href : "group"
          }`;
          if (!isParent(item)) {
            return <NavItem key={key} item={item} />;
          }
          return collapsed ? (
            <Flyout key={key} item={item} />
          ) : (
            <Submenu key={key} item={item} />
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** 一级叶子项：导航链接或动作按钮（见 {@link renderTarget}）。 */
function NavItem({ item }: { item: MenuItem }) {
  const { setOpenMobile } = useSidebar();
  const active = useItemActive(item);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        {renderTarget(item, () => setOpenMobile(false))}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** 展开态父级项：内联可折叠子菜单，命中子项时自动展开并高亮。 */
function Submenu({ item }: { item: Parent }) {
  const { setOpenMobile } = useSidebar();
  const active = useActiveItem();
  const selfActive =
    active != null && (active === item || item.children.includes(active));
  // 受控的 `open`：路由切换时让命中分支重新展开（defaultOpen 只在 mount
  // 时生效一次）。
  const [open, setOpen] = React.useState(selfActive);
  React.useEffect(() => {
    if (selfActive) setOpen(true);
  }, [selfActive]);

  return (
    <Collapsible
      asChild
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.label} isActive={selfActive}>
            <ItemContent item={item} />
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children.map((child) => (
              <SidebarMenuSubItem key={child.label}>
                <SidebarMenuSubButton asChild isActive={active === child}>
                  {renderTarget(child, () => setOpenMobile(false))}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

/** 折叠（仅图标）态父级项：悬停 / 点击在右侧弹出 flyout 列出子项。 */
function Flyout({ item }: { item: Parent }) {
  const { setOpenMobile } = useSidebar();
  const active = useActiveItem();
  const selfActive =
    active != null && (active === item || item.children.includes(active));

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton tooltip={item.label} isActive={selfActive}>
            <ItemContent item={item} />
            <ChevronRight className="ml-auto" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={4}
          className="min-w-52 rounded-lg"
        >
          <DropdownMenuLabel className="flex items-center gap-2">
            {item.label}
            {item.badge && <NavBadge color={item.color}>{item.badge}</NavBadge>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.children.map((child) => (
            <DropdownMenuItem
              key={child.label}
              asChild
              className={cn(
                active === child && "bg-accent text-accent-foreground",
              )}
            >
              {renderTarget(child, () => setOpenMobile(false))}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
