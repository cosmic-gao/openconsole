"use client";

import { ChevronRight, LoaderCircle } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

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

import type { MatchStrategy, MenuData, MenuGroup, MenuItem } from "./types";

type Parent = MenuItem & { children: MenuItem[] };
const hasChildren = (item: MenuItem): item is Parent =>
  Array.isArray(item.children) && item.children.length > 0;

/** 扁平 `MenuItem[]` 归一成单个匿名分组;分组列表原样返回。 */
const asGroups = (data: MenuData): MenuGroup[] => {
  const first = data[0];
  if (!first) return [];
  return "items" in first ? (data as MenuGroup[]) : [{ items: data as MenuItem[] }];
};

/** 折叠态 tooltip:显式优先,否则 label 为字符串时回退。 */
const createTooltip = (item: MenuItem) =>
  item.tooltip ?? (typeof item.label === "string" ? item.label : undefined);

// ── 路由命中 ──────────────────────────────────────────────

const EXPLICIT = Number.MAX_SAFE_INTEGER;
const trimSlash = (path: string) => (path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path);
const toPath = (href: MenuItem["href"]): string | undefined =>
  typeof href === "string"
    ? trimSlash(href)
    : typeof href?.pathname === "string"
      ? trimSlash(href.pathname)
      : undefined;

/**
 * 命中相关度:越大越相关,`-1` 未命中。受控 `active` 与自定义函数取最高优先级,
 * 其余取命中前缀长度(故全局「最长前缀者胜」)。末尾斜杠归一,根 `/` 仅精确命中。
 */
function matching(pathname: string, item: MenuItem): number {
  if (item.active !== undefined) return item.active ? EXPLICIT : -1;
  const match: MatchStrategy = item.match ?? "prefix";
  if (typeof match === "function") return match(pathname) ? EXPLICIT : -1;

  const current = trimSlash(pathname);
  const exact = match === "exact";
  const targets = [toPath(item.href), ...(typeof match === "object" ? match.paths.map(trimSlash) : [])];
  let best = -1;
  for (const target of targets) {
    if (target === undefined) continue;
    if (current === target) best = Math.max(best, target.length);
    else if (!exact && target !== "/" && current.startsWith(`${target}/`)) best = Math.max(best, target.length);
  }
  return best;
}

/** 跨分组挑出最具体的命中项(全局只点亮一项)。 */
function findActive(groups: MenuGroup[], pathname: string): MenuItem | null {
  let active: MenuItem | null = null;
  let best = -1;
  const consider = (item: MenuItem) => {
    const score = matching(pathname, item);
    if (score > best) {
      best = score;
      active = item;
    }
  };
  for (const group of groups) {
    for (const item of group.items) {
      consider(item);
      item.children?.forEach(consider);
    }
  }
  return active;
}

const ActiveContext = createContext<MenuItem | null>(null);
const useActive = () => useContext(ActiveContext);

// ── 渲染 ──────────────────────────────────────────────────

function NavBadge({ children }: { children: ReactNode }) {
  return (
    <Badge
      variant="secondary"
      className="bg-primary/15 text-primary ml-auto h-5 px-1.5 text-[10px] font-medium"
    >
      {children}
    </Badge>
  );
}

/** 字符串徽章走内置样式;其余节点原样渲染(右对齐);空值不渲染。 */
const renderBadge = (badge: ReactNode): ReactNode => {
  if (badge === undefined || badge === null || badge === false || badge === "") return null;
  if (typeof badge === "string") return <NavBadge>{badge}</NavBadge>;
  return <span className="ml-auto inline-flex items-center">{badge}</span>;
};

function ItemBody({ item, icon }: { item: MenuItem; icon?: ReactNode }) {
  return (
    <>
      {icon ?? (item.icon ? <Icon name={item.icon} /> : null)}
      <span>{item.label}</span>
      {renderBadge(item.badge)}
    </>
  );
}

/** 链接前导图标:导航中换成延迟淡入的 spinner。只能用在 `<Link>` 子树内。 */
function PendingIcon({ name }: { name?: string }) {
  const { pending } = useLinkStatus();
  if (pending) return <LoaderCircle className="animate-pending" />;
  return name ? <Icon name={name} /> : null;
}

/**
 * 叶子 / 子项的可点击本体,作为 shadcn 按钮原语的 `asChild` 子节点(须返回真实元素)。
 * `disabled` → 不可点击 span;`href` → `<Link>`;`onSelect` → `<button>`;否则纯标签 span。
 */
function renderTarget(item: MenuItem, onNavigate: () => void): ReactElement {
  if (item.disabled) {
    return (
      <span aria-disabled className="pointer-events-none opacity-50">
        <ItemBody item={item} />
      </span>
    );
  }
  if (item.href !== undefined) {
    return (
      <Link href={item.href} onClick={onNavigate}>
        <ItemBody item={item} icon={<PendingIcon name={item.icon} />} />
      </Link>
    );
  }
  if (item.onSelect) {
    return (
      <button
        type="button"
        onClick={() => {
          item.onSelect?.();
          onNavigate();
        }}
      >
        <ItemBody item={item} />
      </button>
    );
  }
  return (
    <span>
      <ItemBody item={item} />
    </span>
  );
}

/** 分组菜单。接受 `MenuGroup[]` 或扁平 `MenuItem[]`;命中项跨分组统一解析后下发。 */
export function Menu({ items }: { items: MenuData }) {
  const pathname = usePathname();
  const groups = useMemo(() => asGroups(items), [items]);
  const active = useMemo(() => findActive(groups, pathname), [groups, pathname]);

  return (
    <ActiveContext.Provider value={active}>
      {groups.map((group, i) => (
        <Section key={group.id ?? `group-${i}`} group={group} />
      ))}
    </ActiveContext.Provider>
  );
}

function Section({ group }: { group: MenuGroup }) {
  const collapsed = useSidebar().state === "collapsed";
  return (
    <SidebarGroup className="py-0">
      {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
      <SidebarMenu>
        {group.items.map((item, i) => {
          const key = item.id ?? `item-${i}`;
          if (!hasChildren(item)) return <Leaf key={key} item={item} />;
          return collapsed ? <Flyout key={key} item={item} /> : <Tree key={key} item={item} />;
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** 一级叶子:导航链接或动作按钮。 */
function Leaf({ item }: { item: MenuItem }) {
  const { setOpenMobile } = useSidebar();
  const active = useActive() === item;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={createTooltip(item)}>
        {renderTarget(item, () => setOpenMobile(false))}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** 展开态父级:内联可折叠子菜单,命中子项时自动展开。 */
function Tree({ item }: { item: Parent }) {
  const { setOpenMobile } = useSidebar();
  const active = useActive();
  const selfActive = active != null && (active === item || item.children.includes(active));
  const [open, setOpen] = useState(selfActive);
  useEffect(() => {
    if (selfActive) setOpen(true);
  }, [selfActive]);

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={createTooltip(item)} isActive={selfActive}>
            <ItemBody item={item} />
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children.map((child, i) => (
              <SidebarMenuSubItem key={child.id ?? `child-${i}`}>
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

/** 折叠(仅图标)态父级:右侧弹出 flyout 列出子项。 */
function Flyout({ item }: { item: Parent }) {
  const { setOpenMobile } = useSidebar();
  const active = useActive();
  const selfActive = active != null && (active === item || item.children.includes(active));

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton tooltip={createTooltip(item)} isActive={selfActive}>
            <ItemBody item={item} />
            <ChevronRight className="ml-auto" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={4} className="min-w-52 rounded-lg">
          <DropdownMenuLabel className="flex items-center gap-2">
            {item.label}
            {renderBadge(item.badge)}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.children.map((child, i) => (
            <DropdownMenuItem
              key={child.id ?? `child-${i}`}
              asChild
              className={cn(active === child && "bg-accent text-accent-foreground")}
            >
              {renderTarget(child, () => setOpenMobile(false))}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
