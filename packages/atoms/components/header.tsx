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

export interface HeaderProps extends React.ComponentProps<"header"> {
  /**
   * Navigation slot — defaults to `<Breadcrumbs />` (auto-derived from
   * `usePathname()`). Pass a custom `ReactNode` (e.g. a page title) to
   * override, or `false` to hide it entirely. Rendered on the sidebar
   * side of the header alongside the auto-rendered expand button when
   * the sidebar is collapsed.
   */
  breadcrumbs?: ReactNode | false;
  /**
   * Props forwarded to the default `<Breadcrumbs />`. Ignored when
   * `breadcrumbs` is overridden with a custom node.
   */
  breadcrumbsProps?: BreadcrumbsProps;
  /**
   * Tools slot rendered **before** the built-in theme / preferences
   * actions. Typical content: notifications, search box, primary CTAs.
   */
  actions?: ReactNode;
  /**
   * Hide the built-in `ThemeSwitch` + `Preferences` action group. Use
   * when the app provides its own theme / settings controls.
   */
  hideDefaultActions?: boolean;
}

/**
 * Sticky dashboard header pairing with `<Sidebar>` / `<SidebarInset>`.
 *
 * Layout: two segments (`nav` / `tools`) with `justify-between`, a soft
 * `bg-background/60 backdrop-blur-md` backdrop, and a compact `md:h-14`
 * desktop height. Header itself has no padding —— the inner two `<div>`s
 * own `px-4` so each segment hugs its viewport edge.
 *
 * The `nav` segment (breadcrumbs + auto-rendered expand trigger) sits on
 * the same side as the sidebar; the `tools` segment (caller `actions`
 * then built-in `ThemeSwitch` + `Settings`) sits on the opposite side.
 * Swap automatically when `LayoutProvider`'s `side` flips to `"right"`.
 *
 * Within `tools`, `actions` renders **before** the defaults so app-level
 * controls (notifications / search / CTA) sit closer to the page content
 * and theme controls sit at the far edge.
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

  // The nav segment (crumbs + trigger) lives on the sidebar side; the
  // actions segment lives on the opposite side. Swap their order when
  // `side="right"` so they mirror the sidebar position.
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
