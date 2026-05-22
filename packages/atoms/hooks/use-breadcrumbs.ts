"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

export type Crumb = {
  title: string;
  link: string;
};

export interface UseBreadcrumbsOptions {
  /**
   * Per-path title override. Key is the full path (e.g. `/dashboard/orders`),
   * value is the display title. Useful for paths whose raw segment isn't a
   * good label (UUIDs, slugs, dynamic ids).
   *
   * @example { "/dashboard": "Overview", "/dashboard/orders/123": "Order #123" }
   */
  labels?: Record<string, string>;
  /**
   * Transform applied to each path segment when no `labels` entry hits.
   * Defaults to capitalizing the first letter (`employee` → `Employee`).
   */
  transform?: (segment: string, index: number, segments: string[]) => string;
}

const defaultTransform = (segment: string) =>
  segment.charAt(0).toUpperCase() + segment.slice(1);

/**
 * Derive a breadcrumb chain from the current pathname.
 *
 * Each path segment becomes one crumb; `link` accumulates segments up to
 * that level. Example: `/dashboard/orders/123` →
 *
 * ```
 * [
 *   { title: "Dashboard", link: "/dashboard" },
 *   { title: "Orders",    link: "/dashboard/orders" },
 *   { title: "123",       link: "/dashboard/orders/123" },
 * ]
 * ```
 *
 * Customize titles via `labels` (per-path map) or `transform` (default
 * segment → title rule). Hook is headless —— pair with `<Breadcrumbs>` for
 * the default UI or render your own.
 */
export function useBreadcrumbs(options?: UseBreadcrumbsOptions): Crumb[] {
  const pathname = usePathname();
  const labels = options?.labels;
  const transform = options?.transform ?? defaultTransform;

  return useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    return segments.map((segment, index) => {
      const link = `/${segments.slice(0, index + 1).join("/")}`;
      const override = labels?.[link];
      return {
        title: override ?? transform(segment, index, segments),
        link,
      };
    });
  }, [pathname, labels, transform]);
}
