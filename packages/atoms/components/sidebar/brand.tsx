"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";

import {
  Button,
  Icon,
  SidebarMenu,
  SidebarMenuItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSidebar,
} from "@openconsole/shadcn";

import { useLayout } from "../../providers/layout";

import type { Brand as BrandData } from "./types";

/**
 * 侧边栏顶部品牌区。
 *
 * 渲染 logo + name + 可选 description；折叠模式（`collapsible !== "none"`）
 * 下额外渲染一个收起按钮（`side="right"` 时图标自动镜像）。
 */
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleSidebar}
                aria-keyshortcuts="Control+B Meta+B"
                className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer group-data-[collapsible=icon]:hidden"
              >
                {config.side === "right" ? <ChevronsRight /> : <ChevronsLeft />}
                <span className="sr-only">Collapse sidebar</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Collapse sidebar</TooltipContent>
          </Tooltip>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
