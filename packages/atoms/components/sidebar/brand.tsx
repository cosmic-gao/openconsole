"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";

import {
  Button,
  Icon,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@openconsole/shadcn";

import { useLayout } from "../../providers/layout-provider";

import type { Brand as BrandData } from "./types";

export function Brand({ brand }: { brand: BrandData }) {
  const { toggleSidebar } = useSidebar();
  const { config } = useLayout();

  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex h-12 items-center gap-2 px-2 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:px-0">
        <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-md">
          <Icon name={brand.logo} className="size-4" />
        </div>
        <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate font-semibold">{brand.name}</span>
          {brand.description && (
            <span className="text-muted-foreground truncate text-xs">
              {brand.description}
            </span>
          )}
        </div>
        {config.collapsible !== "none" && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSidebar}
            className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer group-data-[collapsible=icon]:hidden"
          >
            {config.side === "right" ? <ChevronsRight /> : <ChevronsLeft />}
            <span className="sr-only">Collapse sidebar</span>
          </Button>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
