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

/** {@link Breadcrumbs} 的 props。 */
export interface BreadcrumbsProps {
  /** 显式 crumb 链;省略则按 `usePathname()` 自动派生。 */
  items?: Crumb[];
  /** 自定义分隔符内容;默认是 shadcn 内置的 `ChevronRight` 图标。 */
  separator?: ReactNode;
  /** 默认中间项在 `< md` 屏幕隐藏以保持紧凑;设为 `true` 则始终可见。 */
  showAllOnMobile?: boolean;
  /** 透传给根 `Breadcrumb` 的类名。 */
  className?: string;
}

/**
 * 面包屑导航。默认按 `usePathname()` 自动派生(常作为 `<Header />` 的导航插槽);
 * 传 `items` 则渲染你给的链(向导步骤、模态流程等非 pathname 场景)。
 *
 * 每条 crumb:有 `href` 且非末项 → 可点击 `<Link>`;末项或无 `href` → 不可点击的
 * `BreadcrumbPage`。无 crumb 时返回 `null`。需要自动派生 + 自定义文本,可组合
 * `<Breadcrumbs items={useBreadcrumbs({ labels })} />`。
 */
export function Breadcrumbs({ items, separator, showAllOnMobile = false, className }: BreadcrumbsProps) {
  const derived = useBreadcrumbs();
  const crumbs = items ?? derived;

  if (crumbs.length === 0) return null;

  // 中间项(非首非尾)在移动端折叠,保持顶栏紧凑。
  const collapsed = showAllOnMobile ? undefined : "hidden md:block";

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={`${index}-${crumb.href ?? crumb.label}`}>
              <BreadcrumbItem className={isLast ? undefined : collapsed}>
                {!isLast && crumb.href !== undefined ? (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator className={collapsed}>{separator}</BreadcrumbSeparator>}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
