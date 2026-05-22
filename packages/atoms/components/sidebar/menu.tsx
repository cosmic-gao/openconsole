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

type Parent = MenuItem & { children: MenuItem[] };

function isParent(item: MenuItem): item is Parent {
  return Array.isArray(item.children) && item.children.length > 0;
}

function isActive(pathname: string, item: MenuItem): boolean {
  if (item.href && pathname === item.href) return true;
  return item.children?.some((c) => c.href === pathname) ?? false;
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
  // Controlled `open` so navigating between routes can re-expand the matching
  // branch (defaultOpen only fires once on mount).
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
              const childActive = pathname === child.href;
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
