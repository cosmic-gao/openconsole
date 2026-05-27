"use client";

import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

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
 * 只渲染品牌 logo（`name` 仅用于图片 logo 的 `alt`）；折叠模式
 * （`collapsible !== "none"`）下额外渲染一个收起按钮，靠 `ml-auto` 推到
 * 最右侧（`side="right"` 时图标自动镜像）。
 *
 * `collapsible === "icon"` 且已折叠时：顶部只留 logo，鼠标悬浮在 logo 上
 * 会就地（淡入淡出）换成展开按钮；其余折叠模式（`offcanvas` / `none`）行为不变。
 */
export function Brand({ brand }: { brand: BrandData }) {
  const { toggleSidebar } = useSidebar();
  const { config } = useLayout();

  return (
    <SidebarMenu>
      <SidebarMenuItem className="group/brand flex h-12 items-center gap-2 px-2 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:px-0">
        <div className="relative size-8 shrink-0">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground absolute inset-0 flex items-center justify-center rounded-md transition-opacity duration-200 group-data-[collapsible=icon]:group-hover/brand:opacity-0">
            <Icon name={brand.logo} alt={brand.name} className="size-4" />
          </div>
          {config.collapsible === "icon" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={toggleSidebar}
                  aria-keyshortcuts="Control+B Meta+B"
                  className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground absolute inset-0 hidden cursor-pointer opacity-0 transition-opacity duration-200 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:group-hover/brand:opacity-100"
                >
                  {config.side === "right" ? (
                    <PanelRightOpen />
                  ) : (
                    <PanelLeftOpen />
                  )}
                  <span className="sr-only">Expand sidebar</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side={config.side === "right" ? "left" : "right"}>
                Expand sidebar
              </TooltipContent>
            </Tooltip>
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
                className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground ml-auto cursor-pointer group-data-[collapsible=icon]:hidden"
              >
                {config.side === "right" ? (
                  <PanelRightClose />
                ) : (
                  <PanelLeftClose />
                )}
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
