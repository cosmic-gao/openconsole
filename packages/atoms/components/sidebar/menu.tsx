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
} from "@opendesign/shadcn";
import type { MenuGroup, MenuItem } from "./types";

const ACTIVE_TEXT = "text-primary";
const ACTIVE_PILL = cn("bg-primary/10", ACTIVE_TEXT);

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
      className={cn(
        "ml-auto rounded-full border-0 px-2 py-0.5 text-[10px] font-medium",
        color === "green"
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-primary/10 text-primary",
      )}
    >
      {children}
    </Badge>
  );
}

function ItemIcon({ name, active }: { name?: string; active: boolean }) {
  return (
    <Icon
      name={name}
      className={cn(
        "transition-colors",
        active
          ? ACTIVE_TEXT
          : "text-muted-foreground group-hover/link:text-foreground",
      )}
    />
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
    <SidebarGroup>
      {group.label && (
        <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          {group.label}
        </SidebarGroupLabel>
      )}
      <SidebarMenu className="gap-1">
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
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.label}
        className={cn(
          "group/link relative transition-all duration-200",
          active && ACTIVE_PILL,
        )}
      >
        <Link href={item.href ?? "#"} onClick={() => setOpenMobile(false)}>
          {active && (
            <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-linear-to-b from-primary to-primary/60" />
          )}
          <ItemIcon name={item.icon} active={active} />
          <span className="font-medium">{item.label}</span>
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
  // Auto-expand when pathname makes this branch active (not just on mount).
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
          <SidebarMenuButton
            tooltip={item.label}
            className={cn(
              "group/link transition-all duration-200",
              active && ACTIVE_TEXT,
            )}
          >
            <ItemIcon name={item.icon} active={active} />
            <span className="font-medium">{item.label}</span>
            {item.badge && (
              <NavBadge color={item.badgeColor}>{item.badge}</NavBadge>
            )}
            <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="border-l-2 border-primary/20 ml-3.5">
            {item.children.map((child) => {
              const childActive = pathname === child.href;
              return (
                <SidebarMenuSubItem key={child.label}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={childActive}
                    className={cn(
                      "transition-all duration-200",
                      childActive && ACTIVE_PILL,
                    )}
                  >
                    <Link
                      href={child.href ?? "#"}
                      onClick={() => setOpenMobile(false)}
                    >
                      <Icon name={child.icon} className="size-4" />
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
          <SidebarMenuButton
            tooltip={item.label}
            className={cn("transition-all duration-200", active && ACTIVE_PILL)}
          >
            <ItemIcon name={item.icon} active={active} />
            <span className="font-medium">{item.label}</span>
            {item.badge && (
              <NavBadge color={item.badgeColor}>{item.badge}</NavBadge>
            )}
            <ChevronRight className="ml-auto size-4 text-muted-foreground" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={4}
          className="min-w-52 rounded-xl border-border/50 bg-background/95 backdrop-blur-xl shadow-xl"
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            {item.label}
            {item.badge && (
              <NavBadge color={item.badgeColor}>{item.badge}</NavBadge>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border/50" />
          {item.children.map((child) => {
            const childActive = pathname === child.href;
            return (
              <DropdownMenuItem
                key={`${child.label}-${child.href}`}
                asChild
                className="rounded-lg"
              >
                <Link
                  href={child.href ?? "#"}
                  className={cn(
                    "flex items-center gap-2 px-2 py-2",
                    childActive && ACTIVE_PILL,
                  )}
                >
                  <Icon name={child.icon} className="size-4" />
                  <span className="max-w-52 text-wrap">{child.label}</span>
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
