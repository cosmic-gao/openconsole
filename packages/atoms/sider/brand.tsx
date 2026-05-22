"use client";

import {
  Icon,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@opendesign/shadcn";
import type { Brand as BrandData } from "./types";

function BrandLogo({ name }: { name: string }) {
  return (
    <div className="relative flex aspect-square size-8 items-center justify-center rounded-lg bg-linear-to-br from-violet-500 to-fuchsia-500 shadow-md shadow-violet-500/20">
      <Icon name={name} className="size-4 text-white" />
      <div className="absolute inset-0 rounded-lg bg-linear-to-br from-white/20 to-transparent" />
    </div>
  );
}

export function Brand({ brand }: { brand: BrandData }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className="cursor-default">
          <BrandLogo name={brand.logo} />
          {!collapsed && (
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{brand.name}</span>
              {brand.description && (
                <span className="truncate text-xs text-muted-foreground">
                  {brand.description}
                </span>
              )}
            </div>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
