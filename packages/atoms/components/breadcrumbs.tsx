"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@openconsole/shadcn";

import { type Crumb, useBreadcrumbs } from "../hooks/use-breadcrumbs";

export interface BreadcrumbsProps {
  /**
   * Manually-provided crumb chain. When set, `labels` is ignored and the
   * hook-derived chain is bypassed entirely. Use this for non-pathname-based
   * breadcrumbs (e.g. wizards, modal flows).
   */
  items?: Crumb[];
  /**
   * Per-path title override forwarded to `useBreadcrumbs` when `items` is
   * not set. See `UseBreadcrumbsOptions["labels"]`.
   */
  labels?: Record<string, string>;
  /**
   * Custom separator content (rendered inside `BreadcrumbSeparator`).
   * Default: shadcn's built-in `ChevronRight` icon.
   */
  separator?: ReactNode;
  /**
   * By default, intermediate crumbs (everything except first / last) are
   * hidden on `< md` screens to keep the header compact. Set `true` to keep
   * them visible at all sizes.
   */
  showAllOnMobile?: boolean;
}

/**
 * Auto-derived breadcrumb navigation, typically slotted into `<Header
 * breadcrumbs={<Breadcrumbs />} />`.
 *
 * Reads `usePathname()` and renders one crumb per segment. Last crumb is
 * the current page (rendered as `BreadcrumbPage`, non-clickable);
 * intermediates are `<Link>`s. Empty pathnames render `null` (no chrome).
 *
 * Customize titles via `labels` (per-path map). For non-pathname-based use
 * cases, pass `items` directly. For headless rendering with your own UI,
 * call `useBreadcrumbs()` instead.
 */
export function Breadcrumbs({
  items: itemsProp,
  labels,
  separator,
  showAllOnMobile = false,
}: BreadcrumbsProps) {
  const derived = useBreadcrumbs({ labels });
  const items = itemsProp ?? derived;

  if (items.length === 0) return null;

  const intermediateClass = showAllOnMobile ? undefined : "hidden md:block";

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${item.link}-${index}`}>
              <BreadcrumbItem
                className={isLast ? undefined : intermediateClass}
              >
                {isLast ? (
                  <BreadcrumbPage>{item.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.link}>{item.title}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && (
                <BreadcrumbSeparator className={intermediateClass}>
                  {separator}
                </BreadcrumbSeparator>
              )}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
