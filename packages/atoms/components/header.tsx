"use client";

import { Settings } from "lucide-react";
import * as React from "react";
import type { ReactNode } from "react";

import {
  Button,
  Separator,
  SidebarTrigger,
  cn,
} from "@openconsole/shadcn";

import { Preferences } from "./preferences";
import { ThemeSwitch } from "./theme-switch";

export interface HeaderProps extends React.ComponentProps<"header"> {
  /**
   * Left-side slot rendered after the `SidebarTrigger`. Typical content:
   * a shadcn `<Breadcrumb>` or a page title. When provided, a vertical
   * separator is auto-inserted between the trigger and this slot.
   */
  breadcrumbs?: ReactNode;
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
  actions,
  hideDefaultActions = false,
  className,
  ...props
}: HeaderProps) {
  const [preferencesOpen, setPreferencesOpen] = React.useState(false);

  return (
    <header
      className={cn(
        "bg-background/60 sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 backdrop-blur-md md:h-14",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        {breadcrumbs && (
          <>
            <Separator orientation="vertical" className="mr-2 h-4" />
            {breadcrumbs}
          </>
        )}
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
              aria-label="打开偏好设置"
            >
              <Settings />
              <span className="sr-only">打开偏好设置</span>
            </Button>
            <Preferences
              open={preferencesOpen}
              onOpenChange={setPreferencesOpen}
            />
          </>
        )}
      </div>
    </header>
  );
}
