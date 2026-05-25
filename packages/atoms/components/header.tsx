"use client";

import { PanelLeftOpen, PanelRightOpen, Settings } from "lucide-react";
import * as React from "react";
import type { ReactNode } from "react";

import {
  Button,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  useSidebar,
} from "@openconsole/shadcn";

import { useLayout } from "../providers/layout-provider";

import { Breadcrumbs, type BreadcrumbsProps } from "./breadcrumbs";
import { Preferences } from "./preferences";
import { ThemeSwitch } from "./theme-switch";

/** {@link Header} 的 props。 */
export interface HeaderProps extends React.ComponentProps<"header"> {
  /**
   * 导航插槽 —— 缺省为 `<Breadcrumbs />`（按 `usePathname()` 自动派生）。
   * 传入自定义 `ReactNode`（例如页面标题）覆盖，传 `false` 完全隐藏。
   * 渲染在与侧边栏同侧，侧边栏折叠时旁边会出现展开按钮。
   */
  breadcrumbs?: ReactNode | false;
  /**
   * 转发给默认 `<Breadcrumbs />` 的 props。当 `breadcrumbs` 被自定义
   * 节点覆盖时本项被忽略。
   */
  breadcrumbsProps?: BreadcrumbsProps;
  /**
   * 操作插槽，渲染在内置 `ThemeSwitch` / `Preferences` 之**前**。
   * 典型内容：通知、搜索框、主 CTA。
   */
  actions?: ReactNode;
  /**
   * 隐藏内置的 `ThemeSwitch` + `Preferences` 按钮组。
   * 应用自带主题 / 设置入口时打开。
   */
  hideDefaultActions?: boolean;
}

/**
 * 与 `<Sidebar>` / `<SidebarInset>` 配对使用的粘性面板顶栏。
 *
 * 版式：左右两段（`nav` / `tools`）+ `justify-between`，背景 `bg-background/60
 * backdrop-blur-md` 半透明虚化，桌面端紧凑 `md:h-14`。`<header>` 本身没有
 * 内边距 —— 两个内部 `<div>` 各自 `px-4`，让两段贴住视口边缘。
 *
 * `nav` 段（面包屑 + 折叠时自动出现的展开按钮）跟侧边栏同侧；`tools` 段
 * （调用方 `actions` + 内置 `ThemeSwitch` / `Settings`）在另一侧。
 * `LayoutProvider` 的 `side` 切到 `"right"` 时自动镜像。
 *
 * 在 `tools` 段内，`actions` 渲染在内置项**之前**，让应用级控件（通知 /
 * 搜索 / CTA）靠近页面内容，主题类控件留在最远端。
 */
export function Header({
  breadcrumbs,
  breadcrumbsProps,
  actions,
  hideDefaultActions = false,
  className,
  ...props
}: HeaderProps) {
  const [preferencesOpen, setPreferencesOpen] = React.useState(false);
  const { state, toggleSidebar } = useSidebar();
  const { config } = useLayout();
  const { side } = config;
  const collapsed = config.collapsible !== "none" && state === "collapsed";

  const crumbs =
    breadcrumbs === false
      ? null
      : (breadcrumbs ?? <Breadcrumbs {...breadcrumbsProps} />);

  const trigger = collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebar}
          aria-keyshortcuts="Control+B Meta+B"
          className={cn("cursor-pointer", side === "right" ? "-mr-1" : "-ml-1")}
        >
          {side === "right" ? <PanelRightOpen /> : <PanelLeftOpen />}
          <span className="sr-only">Expand sidebar</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Expand sidebar</TooltipContent>
    </Tooltip>
  ) : null;

  // nav 段（面包屑 + trigger）放在与侧边栏同侧，tools 段在另一侧。
  // `side="right"` 时交换它们的位置以镜像侧边栏。
  const nav = (
    <div className="flex items-center gap-2 px-4">
      {side !== "right" && trigger && (
        <>
          {trigger}
          {crumbs && <Separator orientation="vertical" className="mr-2 h-4" />}
        </>
      )}
      {crumbs}
      {side === "right" && trigger && (
        <>
          {crumbs && <Separator orientation="vertical" className="ml-2 h-4" />}
          {trigger}
        </>
      )}
    </div>
  );

  const tools = (
    <div className="flex items-center gap-2 px-4">
      {actions}
      {!hideDefaultActions && (
        <>
          <ThemeSwitch />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPreferencesOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={preferencesOpen}
              >
                <Settings />
                <span className="sr-only">Open preferences</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Preferences</TooltipContent>
          </Tooltip>
          <Preferences
            open={preferencesOpen}
            onOpenChange={setPreferencesOpen}
          />
        </>
      )}
    </div>
  );

  return (
    <header
      className={cn(
        "bg-background/60 sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 backdrop-blur-md md:h-14",
        className,
      )}
      {...props}
    >
      {side === "right" ? tools : nav}
      {side === "right" ? nav : tools}
    </header>
  );
}
