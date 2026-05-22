"use client";

import {
  Icon,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@openconsole/shadcn";
import type { Brand as BrandData } from "./types";

export function Brand({ brand }: { brand: BrandData }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className="cursor-default">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md">
            <Icon name={brand.logo} className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{brand.name}</span>
            {brand.description && (
              <span className="text-muted-foreground truncate text-xs">
                {brand.description}
              </span>
            )}
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
