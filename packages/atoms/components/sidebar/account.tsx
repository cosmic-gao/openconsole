"use client";

import { ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  cn,
  useSidebar,
} from "@openconsole/shadcn";
import type { AccountMenuItem, User } from "./types";

const initialsOf = (name: string) => {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
};

function AccountIdentity({ user }: { user: User }) {
  return (
    <>
      <Avatar className="size-8 rounded-lg">
        <AvatarImage src={user.avatar} alt={user.name} />
        <AvatarFallback className="rounded-lg">
          {initialsOf(user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-semibold">{user.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          {user.email}
        </span>
      </div>
    </>
  );
}

export function Account({ user }: { user: User }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const items = user.menu;

  if (!items || items.length === 0) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="cursor-default">
            <AccountIdentity user={user} />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <AccountIdentity user={user} />
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-sm">
                <AccountIdentity user={user} />
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {items.map((item, i) => (
              <React.Fragment key={`${item.label}-${i}`}>
                {item.separator && <DropdownMenuSeparator />}
                <AccountAction
                  item={item}
                  onNavigate={() => setOpenMobile(false)}
                />
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function AccountAction({
  item,
  onNavigate,
}: {
  item: AccountMenuItem;
  onNavigate: () => void;
}) {
  const className = cn(
    item.destructive && "text-destructive focus:text-destructive",
  );

  if (item.href) {
    return (
      <DropdownMenuItem asChild className={className}>
        <Link href={item.href} onClick={onNavigate}>
          {item.icon && <Icon name={item.icon} />}
          <span>{item.label}</span>
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem onSelect={item.onSelect} className={className}>
      {item.icon && <Icon name={item.icon} />}
      <span>{item.label}</span>
    </DropdownMenuItem>
  );
}
