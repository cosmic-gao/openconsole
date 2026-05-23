"use client";

import { PanelLeftOpen, PanelRightOpen, Settings } from "lucide-react";
import * as React from "react";
import type { ReactNode } from "react";

import { Button, Separator, cn, useSidebar } from "@openconsole/shadcn";

import { useLayout } from "../providers/layout-provider";

import { Breadcrumbs, type BreadcrumbsProps } from "./breadcrumbs";
import { Preferences } from "./preferences";
import { ThemeSwitch } from "./theme-switch";

export interface HeaderProps extends React.ComponentProps<"header"> {
  /**
   * Left-side slot. Defaults to `<Breadcrumbs />` (auto-derived from
   * `usePathname()`). Pass a custom `ReactNode` (e.g. a page title) to
   * override, or `false` to hide it entirely. When the sidebar is
   * collapsed, an expand button is auto-rendered on whichever side the
   * sidebar lives (leftmost for `side="left"`, rightmost for
   * `side="right"`).
   */
  breadcrumbs?: ReactNode | false;
  /**
   * Props forwarded to the default `<Breadcrumbs />`. Ignored when
   * `breadcrumbs` is overridden with a custom node.
   */
  breadcrumbsProps?: BreadcrumbsProps;
  /**
   * Right-side slot rendered **before** the built-in theme / preferences
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
 * Layout: two segments (`left` / `right`) with `justify-between`, a soft
 * `bg-background/60 backdrop-blur-md` backdrop, and a compact `md:h-14`
 * desktop height. Header itself has no padding —— the inner two `<div>`s
 * own `px-4` so each segment hugs its viewport edge.
 *
 * Built-in actions (right side): `ThemeSwitch` + a `Settings` button that
 * opens the `Preferences` drawer. Pass `hideDefaultActions` to drop them.
 *
 * Sequence on the right is: `actions` first, then defaults (if not hidden)
 * —— so app-level controls (notifications / search / CTA) sit closer to
 * the page content, while theme controls sit at the far edge.
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
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleSidebar}
      className={cn("cursor-pointer", side === "right" ? "-mr-1" : "-ml-1")}
    >
      {side === "right" ? <PanelRightOpen /> : <PanelLeftOpen />}
      <span className="sr-only">Expand sidebar</span>
    </Button>
  ) : null;

  return (
    <header
      className={cn(
        "bg-background/60 sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 backdrop-blur-md md:h-14",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 px-4">
        {side !== "right" && trigger && (
          <>
            {trigger}
            {crumbs && (
              <Separator orientation="vertical" className="mr-2 h-4" />
            )}
          </>
        )}
        {crumbs}
      </div>
      <div className="flex items-center gap-2 px-4">
        {actions}
        {!hideDefaultActions && (
          <>
            <ThemeSwitch />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPreferencesOpen(true)}
            >
              <Settings />
              <span className="sr-only">Open preferences</span>
            </Button>
            <Preferences
              open={preferencesOpen}
              onOpenChange={setPreferencesOpen}
            />
          </>
        )}
        {side === "right" && trigger && (
          <>
            {(actions || !hideDefaultActions) && (
              <Separator orientation="vertical" className="ml-2 h-4" />
            )}
            {trigger}
          </>
        )}
      </div>
    </header>
  );
}
