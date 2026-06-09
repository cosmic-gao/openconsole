"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import type { ReactNode } from "react";

import {
  Badge,
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
  cn,
  useSidebar,
} from "@openconsole/shadcn";
import type { MenuGroup, MenuItem } from "./types";

/** 类型守卫所需的「父级项」形态：children 至少有一项。 */
type Parent = MenuItem & { children: MenuItem[] };

/** 判断一项是否是父级（带 children）。 */
function isParent(item: MenuItem): item is Parent {
  return Array.isArray(item.children) && item.children.length > 0;
}

/**
 * 判断某个 href 是否匹配当前 pathname。
 *
 * 精确相等，或 pathname 落在该 href 的子路径下（嵌套子路由也算命中，
 * 例如 `/agents` 在 `/agents/123/chat` 时仍高亮）。根路径 `/` 只精确匹配，
 * 避免它在所有页面都命中。
 */
function matchesHref(pathname: string, href: MenuItem["href"]): boolean {
  if (typeof href !== "string") return false;
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

/**
 * 判断本项是否「激活」。
 *
 * - 叶子项：href 命中当前 pathname（含子路径）。
 * - 父级项：children 中任一项 href 命中当前 pathname。
 */
function isActive(pathname: string, item: MenuItem): boolean {
  if (matchesHref(pathname, item.href)) return true;
  return item.children?.some((c) => matchesHref(pathname, c.href)) ?? false;
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

/**
 * 渲染分组菜单。每个 group 是一个 `SidebarGroup`，可选 label。
 *
 * 一级项：叶子直接渲染；带 children 的项根据当前是否折叠：
 * 展开状态 → 内联可折叠子菜单（`<Submenu>`）；
 * 折叠（仅图标）状态 → 弹出右侧 flyout（`<Flyout>`）。
 */
export function Menu({ groups }: { groups: MenuGroup[] }) {
  return (
    <>
      {groups.map((group, i) => (
        <MenuSection key={group.label ?? `group-${i}`} group={group} />
      ))}
    </>
  );
}

function MenuSection({ group }: { group: MenuGroup }) {
  const pathname = usePathname();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <SidebarGroup className="py-0">
      {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
      <SidebarMenu>
        {group.items.map((item) => {
          const key = `${item.label}-${item.href ?? "group"}`;
          if (!isParent(item)) {
            return <Item key={key} item={item} pathname={pathname} />;
          }
          return collapsed ? (
            <Flyout key={key} item={item} pathname={pathname} />
          ) : (
            <Submenu key={key} item={item} pathname={pathname} />
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function Item({ item, pathname }: { item: MenuItem; pathname: string }) {
  const { setOpenMobile } = useSidebar();
  const active = isActive(pathname, item);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link href={item.href ?? "#"} onClick={() => setOpenMobile(false)}>
          {item.icon && <Icon name={item.icon} />}
          <span>{item.label}</span>
          {item.badge && (
            <NavBadge color={item.badgeColor}>{item.badge}</NavBadge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function Submenu({ item, pathname }: { item: Parent; pathname: string }) {
  const { setOpenMobile } = useSidebar();
  const active = isActive(pathname, item);
  // 受控的 `open`：路由切换时让命中分支重新展开（defaultOpen 只在 mount
  // 时生效一次）。
  const [open, setOpen] = React.useState(active);
  React.useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return (
    <Collapsible
      asChild
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.label} isActive={active}>
            {item.icon && <Icon name={item.icon} />}
            <span>{item.label}</span>
            {item.badge && (
              <NavBadge color={item.badgeColor}>{item.badge}</NavBadge>
            )}
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children.map((child) => {
              const childActive = matchesHref(pathname, child.href);
              return (
                <SidebarMenuSubItem key={child.label}>
                  <SidebarMenuSubButton asChild isActive={childActive}>
                    <Link
                      href={child.href ?? "#"}
                      onClick={() => setOpenMobile(false)}
                    >
                      {child.icon && <Icon name={child.icon} />}
                      <span>{child.label}</span>
                      {child.badge && (
                        <NavBadge color={child.badgeColor}>
                          {child.badge}
                        </NavBadge>
                      )}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function Flyout({ item, pathname }: { item: Parent; pathname: string }) {
  const active = isActive(pathname, item);

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton tooltip={item.label} isActive={active}>
            {item.icon && <Icon name={item.icon} />}
            <span>{item.label}</span>
            {item.badge && (
              <NavBadge color={item.badgeColor}>{item.badge}</NavBadge>
            )}
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
            {item.badge && (
              <NavBadge color={item.badgeColor}>{item.badge}</NavBadge>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.children.map((child) => {
            const childActive = pathname === child.href;
            return (
              <DropdownMenuItem key={`${child.label}-${child.href}`} asChild>
                <Link
                  href={child.href ?? "#"}
                  className={cn(
                    "flex items-center gap-2",
                    childActive && "bg-accent text-accent-foreground",
                  )}
                >
                  {child.icon && <Icon name={child.icon} />}
                  <span>{child.label}</span>
                  {child.badge && (
                    <NavBadge color={child.badgeColor}>{child.badge}</NavBadge>
                  )}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
